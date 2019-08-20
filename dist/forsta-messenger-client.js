// vim: ts=4:sw=4:expandtab

(function() {
    'use strict';

    const ns = self.ifrpc = self.ifrpc || {};

    const version = 2;
    const defaultPeerOrigin = '*'; // XXX default to more secure option
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
            this.commands = new Map();
            this.listeners = new Map();
            this.activeCommandRequests = new Map();
            self.addEventListener('message', async ev => {
                if (ev.source !== this.peerFrame) {
                    return;
                }
                if (this.peerOrigin !== '*' && ev.origin !== this.peerOrigin) {
                    console.warn("Message from untrusted origin:", ev.origin);
                    return;
                }
                const data = ev.data;
                if (!data || data.magic !== this.magic) {
                    console.error("Invalid ifrpc magic");
                    return;
                }
                if (data.version !== version) {
                    console.error(`Version mismatch: expected ${version} but got ${data.version}`);
                    return;
                }
                if (data.op === 'command') {
                    if (data.dir === 'request') {
                        await this.handleCommandRequest(ev);
                    } else if (data.dir === 'response') {
                        await this.handleCommandResponse(ev);
                    } else {
                        throw new Error("Command Direction Missing");
                    }
                } else if (data.op === 'event') {
                    await this.handleEvent(ev);
                } else {
                    throw new Error("Invalid ifrpc Operation");
                }
            });

            // Couple meta commands for discovery...
            this.addCommandHandler('ifrpc-get-commands', () => {
                return Array.from(this.commands.keys());
            });
            this.addCommandHandler('ifrpc-get-listeners', () => {
                return Array.from(this.listeners.keys());
            });
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

        triggerEvent(name) {
            const args = Array.from(arguments).slice(1);
            this.sendMessage({
                op: 'event',
                name,
                args
            });
        }

        async invokeCommand(name) {
            const args = Array.from(arguments).slice(1);
            const id = `${Date.now()}-${_idInc++}`;
            const promise = new Promise((resolve, reject) => {
                this.activeCommandRequests.set(id, {resolve, reject});
            });
            this.sendMessage({
                op: 'command',
                dir: 'request',
                name,
                id,
                args
            });
            return await promise;
        }

        sendMessage(data) {
            const msg = Object.assign({
                magic: this.magic,
                version
            }, data);
            this.peerFrame.postMessage(msg, this.peerOrigin);
        }

        sendCommandResponse(ev, success, response) {
            this.sendMessage({
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


(function() {
    'use strict';


    /**
     * The Forsta messenger client class.
     *
     * @memberof forsta.messenger
     * @fires thread-message 
     * @fires thread-message 
     *
     * @example
     * const client = new forsta.messenger.Client(document.querySelector('#myDivId'),
     *                                            {orgEphemeralToken: 'secret'});
     */
    forsta.messenger.Client = class Client {

        /**
         * Thread message event.  Triggered when a new message is added, either by sending
         * or receiving a message.
         *
         * @event thread-message
         * @type {object}
         * @property {string} id - The message id.
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
         * @property {Function} [callback] - Callback to run when client is loaded.
         * @property {string} [url=https://app.forsta.io/@] - Override the default site url.
         * @property {bool} showNav - Unhide the navigation panel used for thread selection.
         * @property {bool} showHeader - Unhide the header panel.
         * @property {bool} showThreadAside - Unhide the optional right aside panel containing thread info.
         * @property {bool} showThreadHeader - Unhide the thread header panel.
         * @property {EphemeralUserInfo} ephemeralUserInfo - Details about the ephemeral user to be created or used.
         *                                                   Only relevant when orgEphemeralToken auth is used.
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
            this.callback = options.callback;
            this._iframe = document.createElement('iframe');
            this._iframe.style.border = '0 solid transparent';
            this._iframe.style.width = '100%';
            this._iframe.style.height = '100%';
            this._iframe.addEventListener('load', () => {
                this._rpc = ifrpc.init(this._iframe.contentWindow);
                this._rpc.addEventListener('init', this._onClientInit.bind(this));
            });
            const url = options.url || 'https://app.forsta.io/@';
            this._iframe.setAttribute('src', `${url}?managed`);
            el.appendChild(this._iframe);
        }

        async _onClientInit() {
            await this._rpc.invokeCommand('configure', {
                auth: this.auth,
                showNav: !!this.options.showNav,
                showHeader: !!this.options.showHeader,
                showThreadAside: !!this.options.showThreadAside,
                showThreadHeader: !!this.options.showThreadHeader,
            });
            if (this._rpcEarlyEvents) {
                for (const x of this._rpcEarlyEvents) {
                    this._rpc.addEventListener(x.event, x.callback);
                }
                delete this._rpcEarlyEvents;
            }
            if (this.callback) {
                await this.callback(this);
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
            return await this._rpc.invokeCommand('nav-panel-toggle', collapse);
        }

        /**
         * Select or create a conversation thread.  If the tag `expression` argument matches an
         * existing thread it will be opened, otherwise a new thread will be created.
         *
         * @param {string} expression - The {@link TagExpression} for the desired thread's
         *                              distribution.
         */
        async threadStartWithExpression(expression) {
            return await this._rpc.invokeCommand('thread-join', expression);
        }

        /**
         * Open a thread by its `ID`.
         *
         * @param {string} id - The thread ID to open.
         */
        async threadOpen(id) {
            return await this._rpc.invokeCommand('thread-open', id);
        }
    };
})();