// vim: ts=4:sw=4:expandtab


/**
 * @namespace forsta
 */
self.forsta = self.forsta || {};

/**
 * @namespace forsta.messenger
 */
forsta.messenger = forsta.messenger || {};


/**
 * @external Element
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element}
 */


(function() {
    'use strict';

    /**
     * The Forsta messenger client class.
     *
     * @memberof forsta.messenger
     */
    forsta.messenger.Client = class Client {

        /**
         * @typedef {Object} ClientOptions
         * @property {Function} [callback] - Callback to run when client is loaded.
         * @property {string} [url=https://app.forsta.io/@embed] - Override the default embed url.
         */

        /**
         * Auth is a single value union.  Only ONE property should be set.
         *
         * Auth tokens are managed at {@link https://app.forsta.io/authtokens}.
         *
         * @typedef {Object} ClientAuth
         * @property {string} [orgEphemeralToken] - Org level ephemeral user token.
         * @property {string} [userAuthToken] - The secret auth token for the forsta user account.
         */


        /**
         * @param {external:Element} el - Element where the messenger should be loaded.
         * @param {ClientAuth} auth - Auth configuration for Forsta user account.
         * @param {ClientOptions} [options]
         *
         * @example
         * const client = new forsta.messenger.Client(document.querySelector('#myDivId'),
         *                                            {orgEphemeralToken: 'secret'});
         */
        constructor(el, auth, options) {
            if (!(el instanceof Element)) {
                throw new TypeError('el argument must be an Element');
            }
            if (!auth) {
                throw new TypeError('auth argument missing');
            }
            const urlParams = new URLSearchParams();
            if (auth.orgEphemeralToken) {
                urlParams.set('token', auth.orgEphemeralToken);
            } else if (auth.userAuthToken) {
                urlParams.set('userToken', auth.userAuthToken);
            } else {
                throw new TypeError('invalid auth value');
            }
            options = options || {};
            this.callback = options.callback;
            this.url = options.url || 'https://app.forsta.io/@embed';
            this._iframe = document.createElement('iframe');
            this._iframe.style.border = '0 solid transparent';
            this._iframe.style.width = '100%';
            this._iframe.style.height = '100%';
            this._iframe.addEventListener('load', () => {
                const iframeWindow = this._iframe.contentWindow;
                this._rpc = ifrpc.init(this._iframe.contentWindow);
                this._rpc.addEventListener('init', this.onClientInit.bind(this));
            });
            this._iframe.setAttribute('src', `${this.url}?${urlParams}`);
            el.appendChild(this._iframe);
        }

        async onClientInit() {
            console.debug('client init');
            if (this.callback) {
                this.callback(this);
            }
        }
    };
})();
