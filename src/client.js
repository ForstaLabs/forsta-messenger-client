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
 * Forsta JSON message exchange payload.  This is the main specification for how messages must be formatted
 * for communication in the Forsta ecosystem.
 *
 * @external ExchangePayload
 * @see {@link https://docs.google.com/document/d/e/2PACX-1vTv9Bahr0MyWiZT6B2xvUpBj0c3NGne0ZPeU40Kyn0UHMlYXVlEb1U5jgVCI0t9FkChVwYRCwTBTTiY/pub}
 */

/**
 * Forsta Tag Expression. This is the main specification for how tag expressions must be formatted
 * in the Forsta ecosystem.
 *
 * @external TagExpression
 * @see {@link https://docs.forsta.io/docs/tag-expressions}
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
         * @param {string} expression - The [TagExpression]{@link external:TagExpression} for the desired thread's
         *                              distribution.
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
         * @param {string} expression - The [TagExpression]{@link external:TagExpression} for the thread's distribution.
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
         * @param {string} expression - The [TagExpression]{@link external:TagExpression} for the thread's distribution.
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
        async threadListAttributes(threadId) {
            return await this._rpc.invokeCommand('thread-list-attributes', threadId);
        }

        /**
         * Get the value of a thread attribute.
         *
         * @param {ThreadID} id - The thread ID to update.
         * @param {string} attr - The thread attribute to get.
         *
         * @returns {*} - The value of the thread attribute.
         */
        async threadGetAttribute(threadId, attr) {
            return await this._rpc.invokeCommand('thread-get-attribute', threadId, attr);
        }

        /**
         * Set the value of a thread attribute.
         *
         * @param {ThreadID} id - The thread ID to update.
         * @param {string} attr - The thread attribute to update.
         * @param {*} value - The value to set.
         */
        async threadSetAttribute(threadId, attr, value) {
            await this._rpc.invokeCommand('thread-set-attribute', threadId, attr, value);
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
    };
})();
