// vim: ts=4:sw=4:expandtab
/* global forsta */


self.forsta = self.forsta || {};
forsta.messenger = forsta.messenger || {};


(function() {
    'use strict';

    /**
     * Nav panel controller interface.
     * DO NOT instantiate directly;  Use the `nav` property of {@link forsta.messenger.Client}.
     *
     * @memberof forsta.messenger
     */
    forsta.messenger.NavController = class NavController {

        constructor(client) {
            if (!(client instanceof forsta.messenger.Client)) {
                throw new TypeError('client argument must be a Client instance');
            }
            this._client = client;
        }
    };
})();
