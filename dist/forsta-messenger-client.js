// vim: ts=4:sw=4:expandtab

(function() {
    'use strict';

    const ns = self.ifrpc = self.ifrpc || {};

    const version = 3;
    const defaultPeerOrigin = '*';
    const defaultMagic = 'ifrpc-magic-494581011';

    let _idInc = 0;

    ns.RemoteError = class RemoteError extends Error {
        static serialize(error) {
            return Object.assign({
                name: error.name,
                message: error.message,
                stack: error.stack
            }, JSON.parse(JSON.stringify(error)));
        }

        static deserialize(data) {
            const instance = new this(`Remote error: <${data.name}: ${data.message}>`);
            instance.remoteError = data;
            return instance;
        }
    };


    class RPC {

        constructor(peerFrame, options) {
            options = options || {};
            this.peerFrame = peerFrame;
            this.magic = options.magic || defaultMagic;
            this.peerOrigin = options.peerOrigin || defaultPeerOrigin;
            this.acceptOpener = !!options.acceptOpener;
            this.acceptParent = !!options.acceptParent;
            this.commands = new Map();
            this.listeners = new Map();
            this.activeCommandRequests = new Map();
            this.constructor.registerMessageHandler(this);

            // Couple meta commands for discovery...
            this.addCommandHandler('ifrpc-get-commands', () => {
                return Array.from(this.commands.keys());
            });
            this.addCommandHandler('ifrpc-get-listeners', () => {
                return Array.from(this.listeners.keys());
            });
        }

        static registerMessageHandler(rpc) {
            if (!this._registered) {
                self.addEventListener('message', this.onMessage.bind(this));
                this._registered = [];
            }
            this._registered.push(rpc);
        }

        static async onMessage(ev) {
            if (!ev.source) {
                return;  // Source frame is gone already.
            }
            for (const rpc of this._registered) {
                if (rpc.peerOrigin !== '*' && ev.origin !== rpc.peerOrigin) {
                    continue;
                }
                const validFrames = new Set([ev.source]);
                if (rpc.acceptOpener && ev.source.opener) {
                    validFrames.add(ev.source.opener);
                }
                if (rpc.acceptParent && ev.source.parent) {
                    validFrames.add(ev.source.parent);
                }
                if (!validFrames.has(rpc.peerFrame)) {
                    continue;
                }
                const data = ev.data;
                if (!data || data.magic !== rpc.magic) {
                    console.warn("Invalid ifrpc magic");
                    continue;
                }
                if (data.version !== version) {
                    console.error(`Version mismatch: expected ${version} but got ${data.version}`);
                    continue;
                }
                if (data.op === 'command') {
                    if (data.dir === 'request') {
                        await rpc.handleCommandRequest(ev);
                    } else if (data.dir === 'response') {
                        await rpc.handleCommandResponse(ev);
                    } else {
                        throw new Error("Command Direction Missing");
                    }
                } else if (data.op === 'event') {
                    await rpc.handleEvent(ev);
                } else {
                    throw new Error("Invalid ifrpc Operation");
                }
            }
        }

        addCommandHandler(name, handler) {
            if (this.commands.has(name)) {
                throw new Error("Command handler already added: " + name);
            }
            this.commands.set(name, handler);
        }

        removeCommandHandler(name) {
            this.commands.delete(name);
        }

        addEventListener(name, callback) {
            if (!this.listeners.has(name)) {
                this.listeners.set(name, []);
            }
            this.listeners.get(name).push(callback);
        }

        removeEventListener(name, callback) {
            const scrubbed = this.listeners.get(name).fitler(x => x !== callback);
            this.listeners.set(name, scrubbed);
        }

        triggerEventWithFrame(frame, name) {
            const args = Array.from(arguments).slice(2);
            this.sendMessage(frame, {
                op: 'event',
                name,
                args
            });
        }

        triggerEvent(name) {
            return this.triggerEventWithFrame.apply(this, [this.peerFrame].concat(Array.from(arguments)));
        }

        async invokeCommandWithFrame(frame, name) {
            const args = Array.from(arguments).slice(2);
            const id = `${Date.now()}-${_idInc++}`;
            const promise = new Promise((resolve, reject) => {
                this.activeCommandRequests.set(id, {resolve, reject});
            });
            this.sendMessage(frame, {
                op: 'command',
                dir: 'request',
                name,
                id,
                args
            });
            return await promise;
        }

        async invokeCommand(name) {
            return await this.invokeCommandWithFrame.apply(this, [this.peerFrame].concat(Array.from(arguments)));
        }

        sendMessage(frame, data) {
            const msg = Object.assign({
                magic: this.magic,
                version
            }, data);
            frame.postMessage(msg, this.peerOrigin);
        }

        sendCommandResponse(ev, success, response) {
            this.sendMessage(ev.source, {
                op: 'command',
                dir: 'response',
                name: ev.data.name,
                id: ev.data.id,
                success,
                response
            });
        }

        async handleCommandRequest(ev) {
            const handler = this.commands.get(ev.data.name);
            if (!handler) {
                const e = new ReferenceError('Invalid Command: ' + ev.data.name);
                this.sendCommandResponse(ev, /*success*/ false, ns.RemoteError.serialize(e));
                throw e;
            }
            try {
                this.sendCommandResponse(ev, /*success*/ true, await handler.apply(ev, ev.data.args));
            } catch(e) {
                this.sendCommandResponse(ev, /*success*/ false, ns.RemoteError.serialize(e));
            }
        }

        async handleCommandResponse(ev) {
            const request = this.activeCommandRequests.get(ev.data.id);
            if (!request) {
                throw new Error("Invalid request ID");
            }
            this.activeCommandRequests.delete(ev.data.id);
            if (ev.data.success) {
                request.resolve(ev.data.response);
            } else {
                request.reject(ns.RemoteError.deserialize(ev.data.response));
            }
        }

        async handleEvent(ev) {
            const callbacks = this.listeners.get(ev.data.name);
            if (!callbacks || !callbacks.length) {
                console.debug("ifrpc event triggered without listeners:", ev.data.name);
                return;
            }
            for (const cb of callbacks) {
                try {
                    await cb.apply(ev, ev.data.args);
                } catch(e) {
                    console.error("ifrpc event listener error:", cb, e);
                }
            }
        }
    }

    ns.init = (frame, options) => new RPC(frame, options);
})();

// vim: ts=4:sw=4:expandtab
/* global forsta, ifrpc */


/**
 * @namespace forsta
 */
self.forsta = self.forsta || {};

/**
 * @namespace forsta.messenger
 */
forsta.messenger = forsta.messenger || {};


/**
 * The various internal attributes a thread model has.
 *
 * @typedef {Object} ThreadAttributes
 * @property {string} id - The thread identifier (UUID).
 * @property {('conversation'|'announcement')} type - The type of thread this is.
 * @property {string} title - Optional title for this thread.
 * @property {string} distribution - The normalized tag expression for this thread.
 */


/**
 * A case-sensitive string value in UUID format.  E.g. "93fad4a7-bfa6-4f84-ab4d-4ed67e1d2658"
 *
 * @typedef {string} UUID
 */


/**
 * Milliseconds since Jan 1 1970 UTC.
 *
 * @typedef {number} Timestamp
 */


/**
 * The ID for a user in the Forsta ecosystem.
 *
 * @typedef {UUID} UserID
 */


/**
 * The ID for a messaging thread.  Every thread must have a unique identifier which is shared
 * amongst peers to distinguish conversations.
 *
 * @typedef {UUID} ThreadID
 */


/**
 * The ID for a message.
 *
 * @typedef {UUID} MessageID
 */


/**
 * Forsta tag expressions are any combination of tag identifiers (user or group).
 * They can include logical operators such as plus "+" and minus "-" to explicitly add
 * and remove certain users or groups from a distribution.  E.g...
 * >     (@macy:acme + @jim:nasa + @sales:nsa) - @drunk:uncle
 *
 * @see {@link https://docs.forsta.io/docs/tag-expressions}
 *
 * @typedef {string} TagExpression
 */


/**
 * Forsta JSON message exchange payload.  This is the main specification for how messages must be formatted
 * for communication in the Forsta ecosystem.
 *
 * @external ExchangePayload
 * @see {@link https://docs.google.com/document/d/e/2PACX-1vTv9Bahr0MyWiZT6B2xvUpBj0c3NGne0ZPeU40Kyn0UHMlYXVlEb1U5jgVCI0t9FkChVwYRCwTBTTiY/pub}
 */


/**
 * Forsta JWT. A Forsta JSON Web Token that is used to authenticate users with the client. JWTs
 * are created using the Atlas API login command. Examples on calling the API are available
 * as shell script and PHP.
 *
 * @external JWT
 * @see [Atlas API Login]{@link https://atlas.forsta.io/}
 * @see [JWT Shell Example]{@link https://github.com/ForstaLabs/developer-examples/tree/master/scripts}
 * @see [JWT PHP Example]{@link https://github.com/ForstaLabs/developer-examples/tree/master/php}
 */

(function() {
    'use strict';

    const ns = forsta.messenger;

    /**
     * The Forsta messenger client class.
     *
     * @memberof forsta.messenger
     * @fires init
     * @fires loaded
     * @fires thread-message
     * @fires thread-message-readmark
     * @fires provisioningrequired
     * @fires provisioningerror
     * @fires provisioningdone
     *
     * @example
     * const client = new forsta.messenger.Client(document.querySelector('#myDivId'),
     *                                            {orgEphemeralToken: 'secret'});
     */
    forsta.messenger.Client = class Client {

        /**
         * The client application has been initialized.  This is emitted shortly after successfully
         * starting up, but before the messenger is fully loaded.  Use the `loaded` event to wait
         * for the client application to be completely available.
         *
         * @event init
         * @type {object}
         */

        /**
         * The client application is fully loaded and ready to be controlled.
         *
         * @event loaded
         * @type {object}
         */

        /**
         * This event is emitted if the application requires the user to perform provisioning of
         * their Identity Key.
         *
         * @event provisioningrequired
         * @type {object}
         */

        /**
         * If an error occurs during provisioning it will be emitted using this event.
         *
         * @event provisioningerror
         * @type {object}
         * @property {Error} error - The error object.
         */

        /**
         * When provisioning has finished successfully this event is emitted.
         *
         * @event provisioningdone
         * @type {object}
         */

        /**
         * Thread message event.  Emitted when a new message is added, either by sending
         * or receiving.
         *
         * @event thread-message
         * @type {object}
         * @property {MessageID} id - The message ID.
         * @property {ThreadID} threadId - The ID of the thread this message belongs to.
         */

        /**
         * Thread message readmark change event.  Read marks indicate the most recent messages read
         * by a peer for a given thread.  They are timestamp values that correspond to the message
         * timestamps.
         *
         * @event thread-message-readmark
         * @type {object}
         * @property {ThreadID} threadId - The ID of the thread this readmark pertains to.
         * @property {UserID} source - The peer user id that sent the readmark.
         * @property {Timestamp} readmark - The timestamp of the readmark.  E.g. How far the user
         *                                  has read to.
         */

        /**
         * Auth is a single value union.  Only ONE property should be set.
         *
         *
         * @typedef {Object} ClientAuth
         * @property {string} [orgEphemeralToken] - Org ephemeral user token created at
         *                                          {@link https://app.forsta.io/authtokens}.
         * @property {string} [jwt] - An existing JSON Web Token for a Forsta user account. Note that
         *                            the JWT may be updated during use.  Subscribe to the `jwtupdate`
         *                            event to handle updates made during extended use.
         */

        /**
         * Information about the ephemeral user that will be created or reused for this session.
         *
         *
         * @typedef {Object} EphemeralUserInfo
         * @property {string} [firstName] - First name of the user.
         * @property {string} [lastName] - Last name of the user.
         * @property {string} [email] - Email of the user.
         * @property {string} [phone] - Phone of the user.  NOTE: Should be SMS capable.
         * @property {string} [salt] - Random value used to distinguish user accounts in advanced use-cases.
         */

        /**
         * @typedef {Object} ClientOptions
         * @property {Function} [onInit] - Callback to run when client is first initialized.
         * @property {Function} [onLoaded] - Callback to run when client is fully loaded and ready to use.
         * @property {string} [url=https://app.forsta.io/@] - Override the default site url.
         * @property {bool} showNav - Unhide the navigation panel used for thread selection.
         * @property {bool} showHeader - Unhide the header panel.
         * @property {bool} showThreadAside - Unhide the optional right aside panel containing thread info.
         * @property {bool} showThreadHeader - Unhide the thread header panel.
         * @property {EphemeralUserInfo} ephemeralUserInfo - Details about the ephemeral user to be created or used.
         *                                                   Only relevant when orgEphemeralToken auth is used.
         * @property {null|ThreadID} openThreadId - Force the messenger to open a specific thread on
         *                                          startup.  If the value is `null` it will force
         *                                          the messenger to not open any thread.
         */


        /**
         * @param {Element} el - Element where the messenger should be loaded.
         *                       {@link https://developer.mozilla.org/en-US/docs/Web/API/Element}
         * @param {ClientAuth} auth - Auth configuration for Forsta user account.
         * @param {ClientOptions} [options]
         */
        constructor(el, auth, options) {
            if (!(el instanceof Element)) {
                throw new TypeError('el argument must be an Element');
            }
            if (!auth) {
                throw new TypeError('auth argument missing');
            }
            this.auth = auth;
            this.options = options || {};
            this.onInit = this.options.onInit;
            this.onLoaded = this.options.onLoaded;
            this._iframe = document.createElement('iframe');
            this._iframe.style.border = 'none';
            this._iframe.style.width = '100%';
            this._iframe.style.height = '100%';
            const desiredFeatures = new Set([
                'camera',
                'microphone',
                'fullscreen',
                'autoplay',
                'display-capture',
                'geolocation',
                'speaker',
                'vibrate'
            ]);
            if (document.featurePolicy && document.featurePolicy.allowedFeatures) {
                const allowed = new Set(document.featurePolicy.allowedFeatures());
                for (const x of Array.from(desiredFeatures)) {
                    if (!allowed.has(x)) {
                        desiredFeatures.delete(x);
                    }
                }
            }
            this._iframe.setAttribute('allow', Array.from(desiredFeatures).join('; '));
            if (desiredFeatures.has('fullscreen')) {
                // Legacy fullscreen mode required too.
                this._iframe.setAttribute('allowfullscreen', 'true');
            }
            this._iframe.src = this.options.url || 'https://app.forsta.io/@';
            el.appendChild(this._iframe);
            this._rpc = ifrpc.init(this._iframe.contentWindow, {acceptOpener: true});
            this._idbGateway = new ns.IDBGateway(this._rpc);
            const _this = this;
            this._rpc.addEventListener('init', function(data) {
                const ev = this;
                _this._onClientInit(ev.source, data);
            });
            if (this.onLoaded) {
                this._rpc.addEventListener('loaded', () => this.onLoaded(this));
            }
        }

        async _onClientInit(frame, data) {
            const config = {
                auth: this.auth
            };
            if (data.scope === 'main') {
                Object.assign(config, {
                    showNav: !!this.options.showNav,
                    showHeader: !!this.options.showHeader,
                    showThreadAside: !!this.options.showThreadAside,
                    showThreadHeader: !!this.options.showThreadHeader,
                    ephemeralUser: this.options.ephemeralUserInfo,
                    openThreadId: this.options.openThreadId,
                });
                if (this._rpcEarlyEvents) {
                    for (const x of this._rpcEarlyEvents) {
                        this._rpc.addEventListener(x.event, x.callback);
                    }
                    delete this._rpcEarlyEvents;
                }
            }
            await this._rpc.invokeCommandWithFrame(frame, 'configure', config);
            if (data.scope === 'main' && this.onInit) {
                await this.onInit(this);
            }
        }

        /**
         * Add an event listener.
         *
         * @param {string} event - Name of the event to listen to.
         * @param {Function} callback - Callback function to invoke.
         */
        addEventListener(event, callback) {
            if (!this._rpc) {
                if (!this._rpcEarlyEvents) {
                    this._rpcEarlyEvents = [];
                }
                this._rpcEarlyEvents.push({event, callback});
            } else {
                this._rpc.addEventListener(event, callback);
            }
        }

        /**
         * Remove an event listener.
         *
         * @param {string} event - Name of the event to stop listening to.
         * @param {Function} callback - Callback function used with {@link addEventListener}.
         */
        removeEventListener(event, callback) {
            if (!this._rpc) {
                this._rpcEarlyEvents = this._rpcEarlyEvents.filter(x =>
                    !(x.event === event && x.callback === callback));
            } else {
                this._rpc.removeEventListener(event, callback);
            }
        }

        /**
         * Expand or collapse the navigation panel.
         *
         * @param {bool} [collapse] - Force the desired collapse state.
         */
        async navPanelToggle(collapse) {
            await this._rpc.invokeCommand('nav-panel-toggle', collapse);
        }

        /**
         * Select or create a thread.  If the tag `expression` argument matches an
         * existing thread it will be opened, otherwise a new thread will be created.
         *
         * @param {TagExpression} expression - The thread distribution to match on or create.
         * @param {ThreadAttributes} [attrs] - Optional attributes to be applied to the resulting
         *                                     thread.
         * @returns {string} The thread ID that was opened or created.
         */
        async threadStartWithExpression(expression, attrs) {
            const id = await this._rpc.invokeCommand('thread-ensure', expression, attrs);
            await this._rpc.invokeCommand('thread-open', id);
            return id;
        }

        /**
         * Ensure that a thread exists matching the expression argument.
         *
         * @param {TagExpression} expression - The thread distribution to match on or create.
         * @param {ThreadAttributes} [attrs] - Optional attributes to be applied to the resulting
         *                                     thread.
         * @returns {string} The thread ID created or matching the expression provided.
         */
        async threadEnsure(expression, attrs) {
            return await this._rpc.invokeCommand('thread-ensure', expression, attrs);
        }

        /**
         * Make a new thread.
         *
         * @param {TagExpression} expression - The thread distribution to create.
         * @param {ThreadAttributes} [attrs] - Optional attributes to be applied to the resulting
         *                                     thread.
         * @returns {string} The thread ID created or matching the expression provided.
         */
        async threadMake(expression, attrs) {
            return await this._rpc.invokeCommand('thread-make', expression, attrs);
        }

        /**
         * Open a thread by its `ID`.
         *
         * @param {string} id - The thread ID to open.
         */
        async threadOpen(id) {
            await this._rpc.invokeCommand('thread-open', id);
        }
        
        /**
         * Create a new call manager in a given thread or with a given ID.
         *
         * @param {string} id - The thread ID in which to create a new call manager OR a callId.
         * @param {bool} options - Optional argument used to pass in certain desired parameters.
         * For example: {autoJoin: true} will automatically join the newly created call.
         */
        async threadCallStart(id, options) {
            await this._rpc.invokeCommand('thread-call-start', id, options);
        }

        /**
         * Join a specified previously created call.
         *
         * @param {string} id - The call id of the call.
         */
        async threadCallJoin(id) {
            await this._rpc.invokeCommand('thread-call-join', id);
        }
        
        /**
         * Leave a specified call.
         *
         * @param {string} id - The call id of the call.
         */
        async threadCallLeave(id) {
            await this._rpc.invokeCommand('thread-call-join', id);
        }
 
        /**
         * Destroy a specified call.
         *
         * @param {string} id - The call id of the call.
         */
        async threadCallEnd(id) {
            await this._rpc.invokeCommand('thread-call-end', id);
        }

        /**
         * Set the expiration time for messages in a thread.  When this value is set to a non-zero
         * value, messages will expire from the thread after they are read.  Set this value to `0`
         * to disable the expiration behavior.
         *
         * @param {string} id - The thread ID to update.
         * @param {number} expiration - Expiration time in seconds.  The expiration timer starts
         * when the message is read by the recipient.
         */
        async threadSetExpiration(id, expiration) {
            await this._rpc.invokeCommand('thread-set-expiration', id, expiration);
        }

        /**
         * List threads known to this client.
         *
         * @returns {string[]} - List of thread IDs.
         */
        async threadList() {
            return await this._rpc.invokeCommand('thread-list');
        }

        /**
         * List the attributes of a thread.
         *
         * @param {ThreadID} id - The thread ID to update.
         *
         * @returns {string[]} - List of thread attibutes.
         */
        async threadListAttributes(id) {
            return await this._rpc.invokeCommand('thread-list-attributes', id);
        }

        /**
         * Get the value of a thread attribute.
         *
         * @param {ThreadID} id - The thread ID to update.
         * @param {string} attr - The thread attribute to get.
         *
         * @returns {*} - The value of the thread attribute.
         */
        async threadGetAttribute(id, attr) {
            return await this._rpc.invokeCommand('thread-get-attribute', id, attr);
        }

        /**
         * Set the value of a thread attribute.
         *
         * @param {ThreadID} id - The thread ID to update.
         * @param {string} attr - The thread attribute to update.
         * @param {*} value - The value to set.
         */
        async threadSetAttribute(id, attr, value) {
            await this._rpc.invokeCommand('thread-set-attribute', id, attr, value);
        }

        /**
         * Archive a thread.
         *
         * @param {ThreadID} id - The thread ID to archive.
         */
        async threadArchive(id, options) {
            await this._rpc.invokeCommand('thread-archive', id, options);
        }

        /**
         * Restore an archived thread to normal status.
         *
         * @param {ThreadID} id - The thread ID to restore from the archives.
         */
        async threadRestore(id, options) {
            await this._rpc.invokeCommand('thread-restore', id, options);
        }

        /**
         * Expunging a thread deletes it and all its messages forever.
         *
         * @param {ThreadID} id - The thread ID to expunge.
         */
        async threadExpunge(id, options) {
            await this._rpc.invokeCommand('thread-expunge', id, options);
        }

        /**
         * Delete local copy of messages for a thread.
         *
         * @param {ThreadID} id - The thread ID to delete messages from.
         */
        async threadDestroyMessages(id) {
            await this._rpc.invokeCommand('thread-destroy-messages', id);
        }

        /**
         * Send a message to a thread.
         *
         * @param {ThreadID} id - The thread ID to send a message to.
         * @param {string} plainText - Plain text message to send.
         * @param {string} [html] - HTML version of message to send.
         * @param {Array} [attachments] - Array of attachment objects.
         * @param {Object} [attrs] - Message attributes.
         * @param {Object} [options] - Send options.
         *
         * @returns {string} - The ID of the message sent.
         */
        async threadSendMessage(id, plainText, html, attachments, attrs, options) {
            return await this._rpc.invokeCommand('thread-send-message', id, plainText, html, attachments, attrs, options);
        }

        /**
         * Send a control message to a thread.
         *
         * @param {ThreadID} id - The thread ID to send a message to.
         * @param {Object} data - Object containing the control information.  Read {@link external:ExchangePayload}
         *                        for more information on control messages.
         * @param {Array} [attachments] - Array of attachment objects.
         * @param {Object} [options] - Send options.
         *
         * @returns {string} - The ID of the message sent.
         */
        async threadSendControl(id, data, attachments, options) {
            return await this._rpc.invokeCommand('thread-send-control', id, data, attachments, options);
        }

        /**
         * Send a thread update to members of a thread.
         *
         * @param {ThreadID} id - The thread ID to send a message to.
         * @param {Object} updates - Object containing the update key/value pairs.  See the `threadUpdate`
         *                           section of {@link external:ExchangePayload} for details.
         * @param {Object} [options] - Options for the thread update.
         */
        async threadSendUpdate(id, updates, options) {
            return await this._rpc.invokeCommand('thread-send-update', id, updates, options);
        }

        /**
         * Amend the distribution of a thread by adding tag expressions to it.
         *
         * @param {ThreadID} id - The thread ID to alter.
         * @param {TagExpression} expression - Snip of valid tag expression to add to the thread.
         *
         * @returns {TagExpression} - The updated tag expression.
         */
        async threadAmendDistribution(id, expression) {
            return await this._rpc.invokeCommand('thread-amend-distribution', id, expression);
        }

        /**
         * Repeal a subset of a thread's distribution.
         *
         * @param {ThreadID} id - The thread ID to alter.
         * @param {TagExpression} expression - Snip of valid tag expression to repeal from the thread.
         *
         * @returns {TagExpression} - The updated tag expression.
         */
        async threadRepealDistribution(id, expression) {
            return await this._rpc.invokeCommand('thread-repeal-distribution', id, expression);
        }

        /**
         * Add a user ID to a thread's distribution.
         *
         * @param {ThreadID} id - The thread ID to alter.
         * @param {UserID} userId - User ID to add to the thread's distribution.
         *
         * @returns {TagExpression} - The updated tag expression.
         */
        async threadAddMember(id, userId) {
            return await this._rpc.invokeCommand('thread-add-member', id, userId);
        }

        /**
         * Remove a user ID from a thread's distribution.
         *
         * @param {ThreadID} id - The thread ID to alter.
         * @param {UserID} userId - User ID to remove from the thread's distribution.
         *
         * @returns {TagExpression} - The updated tag expression.
         */
        async threadRemoveMember(id, userId) {
            return await this._rpc.invokeCommand('thread-remove-member', id, userId);
        }

        /**
         * Leave a thread.  I.e. remove yourself from a thread's distribution.
         *
         * @param {ThreadID} id - The thread ID to alter.
         */
        async threadLeave(id) {
            return await this._rpc.invokeCommand('thread-leave', id);
        }
    };
})();

// vim: ts=4:sw=4:expandtab
/* global forsta */


(function () {
    'use strict';

    self.forsta = self.forsta || {};
    forsta.messenger = forsta.messenger || {};

    const schemas = {
        "User": {
            migrations: [{
                version: 1,
                migrate: function(t) {
                    const messages = t.db.createObjectStore('messages');
                    messages.createIndex('threadId-received', ['threadId', 'received']);
                    messages.createIndex('threadId-read', ['threadId', 'read']);
                    messages.createIndex('sent', 'sent');
                    messages.createIndex('expire', 'expire');
                    const receipts = t.db.createObjectStore('receipts');
                    receipts.createIndex('messageId', 'messageId');
                    const threads = t.db.createObjectStore('threads');
                    threads.createIndex('type-timestamp', ['type', 'timestamp']);
                    t.db.createObjectStore('sessions');
                    t.db.createObjectStore('identityKeys');
                    t.db.createObjectStore('preKeys');
                    t.db.createObjectStore('signedPreKeys');
                    t.db.createObjectStore('state');
                }
            }, {
                version: 2,
                migrate: function(t) {
                    const threads = t.objectStore('threads');
                    threads.createIndex('timestamp', ['timestamp']);
                }
            }, {
                version: 3,
                migrate: function(t) {
                    const cacheStore = t.db.createObjectStore('cache');
                    cacheStore.createIndex('bucket-expiration', ['bucket', 'expiration']);
                }
            }, {
                version: 4,
                migrate: function(t) {} // consolidated
            }, {
                version: 5,
                migrate: function(t) {} // consolidated
            }, {
                version: 6,
                migrate: function(t) {
                    t.db.createObjectStore('contacts');
                }
            }, {
                version: 7,
                migrate: function(t) {
                    const messages = t.objectStore('messages');
                    messages.createIndex('member', 'members', {multiEntry: true});
                }
            }, {
                version: 8,
                migrate: function(t) {
                    const threads = t.objectStore('threads');
                    threads.createIndex('pendingMember', 'pendingMembers', {multiEntry: true});
                }
            }, {
                version: 9,
                migrate: function(t) {} // consolidated
            }, {
                version: 10,
                migrate: function(t) {
                    const messages = t.objectStore('messages');
                    messages.createIndex('ngrams3', 'ngrams3', {multiEntry: true});
                }
            }, {
                version: 11,
                migrate: function(t) {
                    const store = t.db.createObjectStore('protocolReceipts');
                    store.createIndex('sent', 'sent');
                }
            }, {
                version: 12,
                migrate: function(t) { } // consolidated
            }, {
                version: 13,
                migrate: function(t) { } // consolidated
            }, {
                version: 14,
                migrate: async function(t) {
                    const threads = t.objectStore('threads');
                    threads.createIndex('archived-timestamp', ['archived', 'timestamp']);
                    threads.deleteIndex('type-timestamp');
                    const cursorReq = threads.openCursor();
                    await new Promise((resolve, reject) => {
                        cursorReq.onsuccess = ev => {
                            const cursor = ev.target.result;
                            if (cursor) {
                                try {
                                    if (cursor.value.archived === undefined) {
                                        cursor.update(Object.assign(cursor.value, {archived: 0}));
                                    }
                                    cursor.continue();
                                } catch(e) {
                                    reject(e);
                                    throw e;
                                }
                            } else {
                                resolve();
                            }
                        };
                        cursorReq.onerror = ev => {
                            console.error("cursor error event:", ev);
                            reject(new Error('cursor error'));
                        };
                    });
                }
            }, {
                version: 15,
                migrate: function(t) {
                    const messages = t.objectStore('messages');
                    messages.deleteIndex('ngrams3');
                    messages.createIndex('from-ngrams', '_from_ngrams', {multiEntry: true});
                    messages.createIndex('to-ngrams', '_to_ngrams', {multiEntry: true});
                    messages.createIndex('body-ngrams', '_body_ngrams', {multiEntry: true});
                }
            }, {
                version: 16,
                migrate: function(t) {
                    t.db.createObjectStore('trustedIdentities');
                }
            }, {
                version: 17,
                migrate: function(t) {
                    const store = t.db.createObjectStore('quarantinedMessages');
                    store.createIndex('source', 'source');
                }
            }, {
                version: 18,
                migrate: function(t) {
                    const store = t.db.createObjectStore('counters');
                    store.createIndex('model-fk-slot', ['model', 'fk', 'slot']);
                }
            }, {
                version: 19,
                migrate: function(t) {
                    const store = t.objectStore('counters');
                    store.createIndex('model-fk-slot-key', ['model', 'fk', 'slot', 'key']);
                }
            }, {
                version: 20,
                migrate: function(t) {
                    const messages = t.objectStore('messages');
                    messages.createIndex('threadId-serverReceived', ['threadId', 'serverReceived']);
                    messages.deleteIndex('threadId-received');
                }
            }, {
                version: 21,
                migrate: function(t) {
                    const messages = t.objectStore('messages');
                    messages.createIndex('messageRef', 'messageRef');
                }
            }, {
                version: 22,
                migrate: async function(t) {
                    const messages = t.objectStore('messages');
                    messages.createIndex('threadId-timestamp', ['threadId', 'timestamp']);
                    messages.deleteIndex('threadId-serverReceived');
                    const cursorReq = messages.openCursor();
                    await new Promise((resolve, reject) => {
                        cursorReq.onsuccess = ev => {
                            const cursor = ev.target.result;
                            if (cursor) {
                                try {
                                    const timestamp = cursor.value.serverReceived || cursor.value.sent;
                                    const updated = Object.assign({}, cursor.value, {timestamp});
                                    delete updated.serverReceived;
                                    cursor.update(updated);
                                    cursor.continue();
                                } catch(e) {
                                    reject(e);
                                    throw e;
                                }
                            } else {
                                resolve();
                            }
                        };
                        cursorReq.onerror = ev => {
                            console.error("cursor error event:", ev);
                            reject(new Error('cursor error'));
                        };
                    });
                }
            }]
        },

        "SharedCache": {
            migrations: [{
                version: 1,
                migrate: function(t) {
                    const cacheStore = t.db.createObjectStore('cache');
                    cacheStore.createIndex('bucket-expiration', ['bucket', 'expiration']);
                }
            }]
        }
    };


    class IDBDriver {

        constructor(name, id, version, rpc) {
            this.schema = schemas[name];
            this.id = id;
            this.version = version;
            this._rpc = rpc;
            if (!this.schema) {
                throw new Error("No Database Schema");
            }
        }

        async init() {
            console.info(`Opening database ${this.id} (v${this.version})`);
            const openReq = indexedDB.open(this.id, this.version);
            await new Promise((resolve, reject) => {
                openReq.onblocked = ev => {
                    this._rpc.triggerEvent('db-gateway-blocked', this.id);
                };

                openReq.onsuccess = ev => {
                    const db = this.db = ev.target.result;
                    db.onversionchange = ev => {
                        console.warn("Database version change requested somewhere: Closing our connection!");
                        try {
                            db.close();
                        } finally {
                            this._rpc.triggerEvent('db-gateway-versionchange', this.id);
                        }
                    };
                    resolve();
                };

                openReq.onerror = ev => {
                    reject(new Error("Could not connect to the database"));
                };

                openReq.onabort = ev => {
                    reject(new Error("Connection to the database aborted"));
                };

                openReq.onupgradeneeded = async ev => {
                    console.warn(`Database upgrade needed: v${ev.oldVersion} => v${ev.newVersion}`);
                    this.db = ev.target.result;
                    try {
                        await this.migrate(openReq.transaction, ev.oldVersion, ev.newVersion);
                    } catch(e) {
                        reject(e);
                    }
                    // Resolve will eventually be called in onsuccess above ^^^
                };
            });
            this._rpc.addCommandHandler(`db-gateway-read-${this.id}`, this.readHandler.bind(this));
            this._rpc.addCommandHandler(`db-gateway-update-${this.id}`, this.updateHandler.bind(this));
            this._rpc.addCommandHandler(`db-gateway-query-${this.id}`, this.queryHandler.bind(this));
            this._rpc.addCommandHandler(`db-gateway-delete-${this.id}`, this.deleteHandler.bind(this));
            this._rpc.addCommandHandler(`db-gateway-clear-${this.id}`, this.clearHandler.bind(this));
            this._rpc.addCommandHandler(`db-gateway-create-${this.id}`, this.createHandler.bind(this));
            this._rpc.addCommandHandler(`db-gateway-count-${this.id}`, this.countHandler.bind(this));
            this._rpc.addCommandHandler(`db-gateway-object-store-names-${this.id}`, this.objectStoreNamesHandler.bind(this));
        }

        async migrate(transaction, fromVersion, toVersion) {
            console.info(`DB migrate begin version from v${fromVersion} to ${toVersion}`);
            transaction.onerror = ev => {
                throw new Error('Unhandled migration error:', ev);
            };
            transaction.onabort = ev => {
                throw new Error('Unhandled migration abort:', ev);
            };
            const migrations = Array.from(this.schema.migrations).filter(
                x => x.version > fromVersion && x.version <= toVersion);
            if (!migrations || migrations[migrations.length - 1].version !== toVersion) {
                console.error(`Missing migrations for: v${toVersion}; ` +
                              `available: ${migrations.map(x => x.version)}`);
                throw new Error(`Missing migrations for target version: ${toVersion}`);
            }
            for (const migration of migrations) {
                console.warn("DB migrating to:", migration.version);
                await migration.migrate(transaction);
                console.info("DB migrated successfully:", migration.version);
            }
        }

        async createHandler(kwargs) {
            const tx = this.db.transaction([kwargs.storeName], 'readwrite');
            const store = tx.objectStore(kwargs.storeName);
            if (kwargs.idFallback && !store.autoIncrement) {
                kwargs.json[kwargs.idAttribute] = kwargs.idFallback;
            }
            return await new Promise((resolve, reject) => {
                tx.oncomplete = ev => resolve();
                tx.onerror = ev => reject(ev.target.error);
                let addReq;
                if (!store.keyPath) {
                    addReq = store.add(kwargs.json, kwargs.json[kwargs.idAttribute]);
                } else {
                    addReq = store.add(kwargs.json);
                }
                addReq.onerror = ev => reject(ev.target.error);
                if (tx.commit) {
                    tx.commit();
                }
                return kwargs.json;
            });
        }

        async updateHandler(kwargs) {
            const tx = this.db.transaction([kwargs.storeName], 'readwrite');
            const store = tx.objectStore(kwargs.storeName);
            return await new Promise((resolve, reject) => {
                tx.oncomplete = ev => resolve();
                tx.onerror = ev => reject(ev.target.error);
                let putReq;
                if (!store.keyPath) {
                    putReq = store.put(kwargs.json, kwargs.json[kwargs.idAttribute]);
                } else {
                    putReq = store.put(kwargs.json);
                }
                putReq.onerror = ev => reject(ev.target.error);
                if (tx.commit) {
                    tx.commit();
                }
            });
        }

        async readHandler(kwargs) {
            const tx = this.db.transaction([kwargs.storeName], "readonly");
            const store = tx.objectStore(kwargs.storeName);
            let getReq;
            if (kwargs.json[kwargs.idAttribute]) {
                getReq = store.get(kwargs.json[kwargs.idAttribute]);
            } else if (kwargs.index) {
                const index = store.index(kwargs.index.name);
                getReq = index.get(kwargs.index.value);
            } else {
                // We need to find which index we have
                let cardinality = 0; // try to fit the index with most matches
                for (const key of store.indexNames) {
                    const index = store.index(key);
                    if (typeof index.keyPath === 'string' && 1 > cardinality) {
                        // simple index
                        if (kwargs.json[index.keyPath] !== undefined) {
                            getReq = index.get(kwargs.json[index.keyPath]);
                            cardinality = 1;
                        }
                    } else if(typeof index.keyPath === 'object' && index.keyPath.length > cardinality) {
                        // compound index
                        let valid = true;
                        const keyValue = index.keyPath.map(keyPart => {
                            valid = valid && kwargs.json[keyPart] !== undefined;
                            return kwargs.json[keyPart];
                        });
                        if (valid) {
                            getReq = index.get(keyValue);
                            cardinality = index.keyPath.length;
                        }
                    }
                }
            }
            if (getReq) {
                return await new Promise((resolve, reject) => {
                    getReq.onsuccess = ev => resolve(ev.target.result);
                    getReq.onerror = ev => reject(ev.target.error);
                });
            }
        }

        async deleteHandler(kwargs) {
            const tx = this.db.transaction([kwargs.storeName], 'readwrite');
            const store = tx.objectStore(kwargs.storeName);
            const idAttribute = store.keyPath || kwargs.idAttribute;
            return await new Promise((resolve, reject) => {
                tx.oncomplete = ev => resolve();
                tx.onerror = ev => reject(ev.target.error);
                store.delete(kwargs.json[idAttribute]).onerror = ev => reject(ev.target.error);
                if (tx.commit) {
                    tx.commit();
                }
            });
        }

        async clearHandler(kwargs) {
            const tx = this.db.transaction([kwargs.storeName], "readwrite");
            const store = tx.objectStore(kwargs.storeName);
            return await new Promise((resolve, reject) => {
                tx.oncomplete = ev => resolve();
                tx.onerror = ev => reject(ev.target.error);
                store.clear().onerror = ev => reject(ev.target.error);
                if (tx.commit) {
                    tx.commit();
                }
            });
        }

        async queryHandler(kwargs) {
            const elements = [];
            let skipped = 0;
            const tx = this.db.transaction([kwargs.storeName], "readonly");
            const store = tx.objectStore(kwargs.storeName);
            let readCursor;
            let bounds;
            let index;
            if (kwargs.conditions) {
                // We have a condition, we need to use it for the cursor
                for (const key of store.indexNames) {
                    if (!readCursor) {
                        index = store.index(key);
                        if (kwargs.conditions[index.keyPath] instanceof Array) {
                            const lower = kwargs.conditions[index.keyPath][0] > kwargs.conditions[index.keyPath][1] ?
                                          kwargs.conditions[index.keyPath][1] :
                                          kwargs.conditions[index.keyPath][0];
                            const upper = kwargs.conditions[index.keyPath][0] > kwargs.conditions[index.keyPath][1] ?
                                          kwargs.conditions[index.keyPath][0] :
                                          kwargs.conditions[index.keyPath][1];
                            bounds = IDBKeyRange.bound(lower, upper, true, true);
                            if (kwargs.conditions[index.keyPath][0] > kwargs.conditions[index.keyPath][1]) {
                                // Looks like we want the DESC order
                                readCursor = index.openCursor(bounds, IDBCursor.PREV || "prev");
                            } else {
                                // We want ASC order
                                readCursor = index.openCursor(bounds, IDBCursor.NEXT || "next");
                            }
                        } else if (typeof kwargs.conditions[index.keyPath] === 'object' &&
                                   ('$gt' in kwargs.conditions[index.keyPath] ||
                                    '$gte' in kwargs.conditions[index.keyPath])) {
                            if ('$gt' in kwargs.conditions[index.keyPath])
                                bounds = IDBKeyRange.lowerBound(kwargs.conditions[index.keyPath]['$gt'], true);
                            else
                                bounds = IDBKeyRange.lowerBound(kwargs.conditions[index.keyPath]['$gte']);
                            readCursor = index.openCursor(bounds, IDBCursor.NEXT || "next");
                        } else if (typeof kwargs.conditions[index.keyPath] === 'object' &&
                                   ('$lt' in kwargs.conditions[index.keyPath] ||
                                    '$lte' in kwargs.conditions[index.keyPath])) {
                            let bounds;
                            if ('$lt' in kwargs.conditions[index.keyPath])
                                bounds = IDBKeyRange.upperBound(kwargs.conditions[index.keyPath]['$lt'], true);
                            else
                                bounds = IDBKeyRange.upperBound(kwargs.conditions[index.keyPath]['$lte']);
                            readCursor = index.openCursor(bounds, IDBCursor.NEXT || "next");
                        } else if (kwargs.conditions[index.keyPath] != undefined) {
                            bounds = IDBKeyRange.only(kwargs.conditions[index.keyPath]);
                            readCursor = index.openCursor(bounds);
                        }
                    }
                }
            } else if (kwargs.index) {
                index = store.index(kwargs.index.name);
                const excludeLower = !!kwargs.index.excludeLower;
                const excludeUpper = !!kwargs.index.excludeUpper;
                if (index) {
                    if (kwargs.index.lower && kwargs.index.upper) {
                        bounds = IDBKeyRange.bound(kwargs.index.lower, kwargs.index.upper,
                                                   excludeLower, excludeUpper);
                    } else if (kwargs.index.lower) {
                        bounds = IDBKeyRange.lowerBound(kwargs.index.lower, excludeLower);
                    } else if (kwargs.index.upper) {
                        bounds = IDBKeyRange.upperBound(kwargs.index.upper, excludeUpper);
                    } else if (kwargs.index.only) {
                        bounds = IDBKeyRange.only(kwargs.index.only);
                    }
                    if (typeof kwargs.index.order === 'string' &&
                        kwargs.index.order.toLowerCase() === 'desc') {
                        readCursor = index.openCursor(bounds, IDBCursor.PREV || "prev");
                    } else {
                        readCursor = index.openCursor(bounds, IDBCursor.NEXT || "next");
                    }
                }
            } else {
                // No conditions, use the index
                if (kwargs.range) {
                    const lower = kwargs.range[0] > kwargs.range[1] ? kwargs.range[1] : kwargs.range[0];
                    const upper = kwargs.range[0] > kwargs.range[1] ? kwargs.range[0] : kwargs.range[1];
                    bounds = IDBKeyRange.bound(lower, upper);
                    if (kwargs.range[0] > kwargs.range[1]) {
                        readCursor = store.openCursor(bounds, IDBCursor.PREV || "prev");
                    } else {
                        readCursor = store.openCursor(bounds, IDBCursor.NEXT || "next");
                    }
                } else if (kwargs.sort && kwargs.sort.index) {
                    if (kwargs.sort.order === -1) {
                        readCursor = store.index(kwargs.sort.index).openCursor(null, IDBCursor.PREV || "prev");
                    } else {
                        readCursor = store.index(kwargs.sort.index).openCursor(null, IDBCursor.NEXT || "next");
                    }
                } else {
                    readCursor = store.openCursor();
                }
            }

            if (!readCursor) {
                throw new Error("No Cursor");
            }
            return await new Promise((resolve, reject) => {
                readCursor.onerror = ev => reject(ev.target.error);
                readCursor.onsuccess = ev => {
                    const cursor = ev.target.result;
                    if (!cursor) {
                        resolve(elements);
                    } else if (kwargs.limit && elements.length >= kwargs.limit) {
                        if (bounds) {
                            if (kwargs.conditions && kwargs.conditions[index.keyPath]) {
                                // We need to 'terminate' the cursor cleany, by moving to the end
                                cursor.continue(kwargs.conditions[index.keyPath][1] + 1);
                            } else if (kwargs.index && (kwargs.index.upper || kwargs.index.lower)) {
                                if (typeof kwargs.index.order === 'string' &&
                                    kwargs.index.order.toLowerCase() === 'desc') {
                                    cursor.continue(kwargs.index.lower);
                                } else {
                                    cursor.continue(kwargs.index.upper);
                                }
                            }
                        } else {
                            // We need to 'terminate' the cursor cleany, by moving to the end
                            cursor.continue();
                        }
                    } else if (kwargs.offset && kwargs.offset > skipped) {
                        skipped++;
                        cursor.continue(); // We need to move the cursor forward
                    } else {
                        elements.push(cursor.value);
                        cursor.continue();
                    }
                };
            });
        }

        async countHandler(kwargs) {
            const tx = this.db.transaction([kwargs.storeName], 'readonly');
            const store = tx.objectStore(kwargs.storeName);
            return await new Promise((resolve, reject) => {
                let countReq;
                if (kwargs.index) {
                    let keyRange;
                    if (kwargs.bound) {
                        keyRange = IDBKeyRange.bound(kwargs.bound.lower, kwargs.bound.upper,
                                                     kwargs.bound.lowerOpen, kwargs.bound.upperOpen);
                    } else {
                        throw new Error("Unsupported keyRange");
                    }
                    const index = store.index(kwargs.index);
                    countReq = index.count(keyRange);
                } else {
                    countReq = store.count();
                }
                countReq.onerror = ev => reject(ev.target.error);
                countReq.onsuccess = ev => resolve(ev.target.result);
                if (tx.commit) {
                    tx.commit();
                }
            });
        }

        objectStoreNamesHandler() {
            return Array.from(this.db.objectStoreNames);
        }
    }

    forsta.messenger.IDBGateway = class IDBGateway {
        constructor(rpc) {
            this._rpc = rpc;
            this._rpc.addCommandHandler('db-gateway-init', this.onInitHandler.bind(this));
            this._initialized = new Map();
        }

        async onInitHandler(kwargs) {
            if (!this._initialized.has(kwargs.name)) {
                const driver = new IDBDriver(kwargs.name, kwargs.id, kwargs.version, this._rpc);
                await driver.init();
                this._initialized.set(kwargs.name, driver);
            }
        }
    };
})();
