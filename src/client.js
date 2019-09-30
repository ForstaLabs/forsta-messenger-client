// vim: ts=4:sw=4:expandtab
/* global forsta, ifrpc */

(function() {
    'use strict';

    /**
     * @namespace forsta
     */
    self.forsta = self.forsta || {};

    /**
     * @namespace forsta.messenger
     */
    const ns = forsta.messenger = forsta.messenger || {};

    /**
     * The Forsta messenger client class.
     *
     * @memberof forsta.messenger
     * @fires init
     * @fires loaded
     * @fires thread-message
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
         * @property {string} id - The message id.
         * @property {string} threadId - The id of the thread this message belongs to.
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
         * @property {null|string} openThreadId - Force the messenger to open a specific thread on
         *                                        startup.  If the value is `null` it will force
         *                                        the messenger to not open any thread.
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
            const url = this.options.url || 'https://app.forsta.io/@';
            this._iframe.setAttribute('src', `${url}?managed`);
            el.appendChild(this._iframe);
            this._rpc = ifrpc.init(this._iframe.contentWindow);
            this._idbGateway = new ns.IDBGateway(this._rpc);
            this._rpc.addEventListener('init', this._onClientInit.bind(this));
            if (this.onLoaded) {
                this._rpc.addEventListener('loaded', () => this.onLoaded(this));
            }
        }

        async _onClientInit() {
            await this._rpc.invokeCommand('configure', {
                auth: this.auth,
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
            await this._rpc.invokeCommand('nav-panel-toggle', collapse);
        }

        /**
         * Select or create a conversation thread.  If the tag `expression` argument matches an
         * existing thread it will be opened, otherwise a new thread will be created.
         *
         * @param {string} expression - The {@link TagExpression} for the desired thread's
         *                              distribution.
         * @returns {string} The threadId that was opened.
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
         * @param {string} id - The thread ID to update.
         * @returns {string[]} - List of thread attibutes.
         */
        async threadListAttributes(threadId) {
            return await this._rpc.invokeCommand('thread-list-attributes', threadId);
        }

        /**
         * Get the value of a thread attribute.
         *
         * @param {string} id - The thread ID to update.
         * @param {string} attr - The thread attribute to get.
         * @returns {*} - The value of the thread attribute.
         */
        async threadGetAttribute(threadId, attr) {
            return await this._rpc.invokeCommand('thread-get-attribute', threadId, attr);
        }

        /**
         * Set the value of a thread attribute.
         *
         * @param {string} id - The thread ID to update.
         * @param {string} attr - The thread attribute to update.
         * @param {*} value - The value to set.
         */
        async threadSetAttribute(threadId, attr, value) {
            return await this._rpc.invokeCommand('thread-set-attribute', threadId, attr, value);
        }
    };
})();
