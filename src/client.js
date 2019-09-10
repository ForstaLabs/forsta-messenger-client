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
         * @property {Function} [onInit] - Callback to run when client is first initialized.
         * @property {Function} [onLoaded] - Callback to run when client is fully loaded and ready to use.
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
            this.onInit = this.options.onInit;
            this.onLoaded = this.options.onLoaded;
            this._iframe = document.createElement('iframe');
            this._iframe.style.border = 'none';
            this._iframe.style.width = '100%';
            this._iframe.style.height = '100%';
            this._iframe.setAttribute('allow', 'camera; microphone; fullscreen; autoplay; ' +
                                               'display-capture; geolocation; speaker; vibrate;');
            this._iframe.setAttribute('allowfullscreen', 'true');
            this._iframe.addEventListener('load', () => {
                this._rpc = ifrpc.init(this._iframe.contentWindow);
                this._rpc.addEventListener('init', this._onClientInit.bind(this));
                if (this.onLoaded) {
                    this._rpc.addEventListener('loaded', () => this.onLoaded(this));
                }
            });
            const url = this.options.url || 'https://app.forsta.io/@';
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
                ephemeralUser: this.options.ephemeralUserInfo,
            });
            if (this._rpcEarlyEvents) {
                for (const x of this._rpcEarlyEvents) {
                    this._rpc.addEventListener(x.event, x.callback);
                }
                delete this._rpcEarlyEvents;
            }
            if (this.onInit) {
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
