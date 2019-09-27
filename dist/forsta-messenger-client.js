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
            this._iframe.addEventListener('load', () => {
                this._rpc = ifrpc.init(this._iframe.contentWindow);
                this._idbGateway = new ns.IDBGateway(this._rpc);
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
            const openRequest = indexedDB.open(this.id, this.version);
            await new Promise((resolve, reject) => {
                openRequest.onblocked = ev => {
                    this._rpc.triggerEvent('db-gateway-blocked', this.id);
                };

                openRequest.onsuccess = ev => {
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

                openRequest.onerror = ev => {
                    reject(new Error("Could not connect to the database"));
                };

                openRequest.onabort = ev => {
                    reject(new Error("Connection to the database aborted"));
                };

                openRequest.onupgradeneeded = async ev => {
                    console.warn(`Database upgrade needed: v${ev.oldVersion} => v${ev.newVersion}`);
                    this.db = ev.target.result;
                    try {
                        await this.migrate(openRequest.transaction, ev.oldVersion, ev.newVersion);
                    } catch(e) {
                        reject(e);
                    }
                    // Resolve will eventually be called in onsuccess above ^^^
                };
            });
            this._rpc.addCommandHandler(`db-gateway-read-${this.id}`, this.onReadHandler.bind(this));
            this._rpc.addCommandHandler(`db-gateway-update-${this.id}`, this.onUpdateHandler.bind(this));
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

        execute(storeName, method, storable, options) {
            if (method === 'create') {
                this.create(storeName, storable, options);
            } else if (method === 'read') {
                if (storable.id || storable.cid) {
                    this.read(storeName, storable, options);
                } else {
                    this.query(storeName, storable, options);
                }
            } else if (method === 'update') {
                this.update(storeName, storable, options);
            } else if (method === 'delete') {
                if (storable.id || storable.cid) {
                    this.delete(storeName, storable, options);
                } else {
                    //assertCollection(storable);
                    this.clear(storeName, options);
                }
            } else if (method === 'noop') {
                options.success();
                return;
            } else {
                throw new Error(`Unexpected method: ${method}`);
            }
        }

        create(storeName, model, options) {
            if (this.schema.readonly) {
                throw new Error("Database is readonly");
            }
            //assertModel(model);
            const writeTransaction = this.db.transaction([storeName], 'readwrite');
            const store = writeTransaction.objectStore(storeName);
            const json = model.toJSON();
            const idAttribute = _.result(model, 'idAttribute');
            if (json[idAttribute] === undefined && !store.autoIncrement) {
                json[idAttribute] = F.util.uuid4();
            }
            writeTransaction.onerror = e => options.error(e);
            writeTransaction.oncomplete = () => options.success(json);
            if (!store.keyPath) {
                store.add(json, json[idAttribute]);
            } else {
                store.add(json);
            }
        }

        async onUpdateHandler(kwargs) {
            const tx = this.db.transaction([kwargs.storeName], 'readwrite');
            const store = tx.objectStore(kwargs.storeName);
            const txDone = new Promise((resolve, reject) => {
                tx.oncomplete = ev => resolve();
                tx.onerror = ev => reject(new Error("Unexpected update error"));
            });
            if (!store.keyPath) {
                store.put(kwargs.json, kwargs.json[kwargs.idAttribute]);
            } else {
                store.put(kwargs.json);
            }
            if (tx.commit) {
                tx.commit();
            }
            await txDone;
        }

        async onReadHandler(kwargs) {
            const tx = this.db.transaction([kwargs.storeName], "readonly");
            const store = tx.objectStore(kwargs.storeName);
            const json = kwargs.json;
            const idAttribute = kwargs.idAttribute;
            let getRequest;
            let keyIdent;
            if (json[idAttribute]) {
                keyIdent = json[idAttribute];
                getRequest = store.get(keyIdent);
            } else if (kwargs.index) {
                const index = store.index(kwargs.index.name);
                keyIdent = kwargs.index.value;
                getRequest = index.get(keyIdent);
            } else {
                throw new Error("Unsupported ambiguous get request!!!!!");
                /*
                // We need to find which index we have
                let cardinality = 0; // try to fit the index with most matches
                _.each(store.indexNames, key => {
                    const index = store.index(key);
                    if (typeof index.keyPath === 'string' && 1 > cardinality) {
                        // simple index
                        if (json[index.keyPath] !== undefined) {
                            keyIdent = json[index.keyPath];
                            getRequest = index.get(keyIdent);
                            cardinality = 1;
                        }
                    } else if(typeof index.keyPath === 'object' && index.keyPath.length > cardinality) {
                        // compound index
                        let valid = true;
                        const keyValue = _.map(index.keyPath, keyPart => {
                            valid = valid && json[keyPart] !== undefined;
                            return json[keyPart];
                        });
                        if (valid) {
                            keyIdent = keyValue;
                            getRequest = index.get(keyIdent);
                            cardinality = index.keyPath.length;
                        }
                    }
                });
                */
            }
            return await new Promise((resolve, reject) => {
                if (getRequest) {
                    getRequest.onsuccess = ev => resolve(ev.target.result);
                    getRequest.onerror = ev => reject(new Error("Unexpected read error"));
                }
            });
        }

        // Deletes the json.id key and value in storeName from db.
        delete(storeName, model, options) {
            // XXX PORT
            if (this.schema.readonly) {
                throw new Error("Database is readonly");
            }
            //assertModel(model);
            const deleteTransaction = this.db.transaction([storeName], 'readwrite');
            const store = deleteTransaction.objectStore(storeName);
            const json = model.toJSON();
            const idAttribute = store.keyPath || _.result(model, 'idAttribute');
            const deleteRequest = store.delete(json[idAttribute]);
            deleteTransaction.oncomplete = () => options.success(null);
            deleteRequest.onerror = () => options.error(new Error("Not Deleted"));
        }

        clear(storeName, options) {
            // XXX PORT
            if (this.schema.readonly) {
                throw new Error("Database is readonly");
            }
            const deleteTransaction = this.db.transaction([storeName], "readwrite");
            const store = deleteTransaction.objectStore(storeName);
            const deleteRequest = store.clear();
            deleteRequest.onsuccess = () => options.success(null);
            deleteRequest.onerror = () => options.error("Not Cleared");
        }

        // Performs a query on storeName in db.
        // options may include :
        // - conditions : value of an index, or range for an index
        // - range : range for the primary key
        // - limit : max number of elements to be yielded
        // - offset : skipped items.
        query(storeName, collection, options) {
            // XXX PORT
            //assertCollection(collection);
            const elements = [];
            let skipped = 0;
            let processed = 0;
            const queryTransaction = this.db.transaction([storeName], "readonly");
            const idAttribute = collection.idAttribute || _.result(collection.model.prototype, 'idAttribute');
            const store = queryTransaction.objectStore(storeName);

            let readCursor;
            let bounds;
            let index;
            if (options.conditions) {
                // We have a condition, we need to use it for the cursor
                _.each(store.indexNames, key => {
                    if (!readCursor) {
                        index = store.index(key);
                        if (options.conditions[index.keyPath] instanceof Array) {
                            const lower = options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1] ?
                                          options.conditions[index.keyPath][1] :
                                          options.conditions[index.keyPath][0];
                            const upper = options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1] ?
                                          options.conditions[index.keyPath][0] :
                                          options.conditions[index.keyPath][1];
                            bounds = IDBKeyRange.bound(lower, upper, true, true);
                            if (options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1]) {
                                // Looks like we want the DESC order
                                readCursor = index.openCursor(bounds, IDBCursor.PREV || "prev");
                            } else {
                                // We want ASC order
                                readCursor = index.openCursor(bounds, IDBCursor.NEXT || "next");
                            }
                        } else if (typeof options.conditions[index.keyPath] === 'object' &&
                                   ('$gt' in options.conditions[index.keyPath] ||
                                    '$gte' in options.conditions[index.keyPath])) {
                            if ('$gt' in options.conditions[index.keyPath])
                                bounds = IDBKeyRange.lowerBound(options.conditions[index.keyPath]['$gt'], true);
                            else
                                bounds = IDBKeyRange.lowerBound(options.conditions[index.keyPath]['$gte']);
                            readCursor = index.openCursor(bounds, IDBCursor.NEXT || "next");
                        } else if (typeof options.conditions[index.keyPath] === 'object' &&
                                   ('$lt' in options.conditions[index.keyPath] ||
                                    '$lte' in options.conditions[index.keyPath])) {
                            let bounds;
                            if ('$lt' in options.conditions[index.keyPath])
                                bounds = IDBKeyRange.upperBound(options.conditions[index.keyPath]['$lt'], true);
                            else
                                bounds = IDBKeyRange.upperBound(options.conditions[index.keyPath]['$lte']);
                            readCursor = index.openCursor(bounds, IDBCursor.NEXT || "next");
                        } else if (options.conditions[index.keyPath] != undefined) {
                            bounds = IDBKeyRange.only(options.conditions[index.keyPath]);
                            readCursor = index.openCursor(bounds);
                        }
                    }
                });
            } else if (options.index) {
                index = store.index(options.index.name);
                const excludeLower = !!options.index.excludeLower;
                const excludeUpper = !!options.index.excludeUpper;
                if (index) {
                    if (options.index.lower && options.index.upper) {
                        bounds = IDBKeyRange.bound(options.index.lower, options.index.upper,
                                                   excludeLower, excludeUpper);
                    } else if (options.index.lower) {
                        bounds = IDBKeyRange.lowerBound(options.index.lower, excludeLower);
                    } else if (options.index.upper) {
                        bounds = IDBKeyRange.upperBound(options.index.upper, excludeUpper);
                    } else if (options.index.only) {
                        bounds = IDBKeyRange.only(options.index.only);
                    }
                    if (typeof options.index.order === 'string' &&
                        options.index.order.toLowerCase() === 'desc') {
                        readCursor = index.openCursor(bounds, IDBCursor.PREV || "prev");
                    } else {
                        readCursor = index.openCursor(bounds, IDBCursor.NEXT || "next");
                    }
                }
            } else {
                // No conditions, use the index
                if (options.range) {
                    const lower = options.range[0] > options.range[1] ? options.range[1] : options.range[0];
                    const upper = options.range[0] > options.range[1] ? options.range[0] : options.range[1];
                    bounds = IDBKeyRange.bound(lower, upper);
                    if (options.range[0] > options.range[1]) {
                        readCursor = store.openCursor(bounds, IDBCursor.PREV || "prev");
                    } else {
                        readCursor = store.openCursor(bounds, IDBCursor.NEXT || "next");
                    }
                } else if (options.sort && options.sort.index) {
                    if (options.sort.order === -1) {
                        readCursor = store.index(options.sort.index).openCursor(null, IDBCursor.PREV || "prev");
                    } else {
                        readCursor = store.index(options.sort.index).openCursor(null, IDBCursor.NEXT || "next");
                    }
                } else {
                    readCursor = store.openCursor();
                }
            }

            if (typeof readCursor == "undefined" || !readCursor) {
                options.error(new Error("No Cursor"));
            } else {
                readCursor.onerror = ev => {
                    const error = ev.target.error;
                    console.error("readCursor error", error, error.code, error.message, error.name, readCursor,
                                  storeName, collection);
                    options.error(error);
                };
                // Setup a handler for the cursor’s `success` event:
                readCursor.onsuccess = ev => {
                    const cursor = ev.target.result;
                    if (!cursor) {
                        if (options.addIndividually || options.clear) {
                            options.success(elements, /*silenced*/ true);
                        } else {
                            options.success(elements); // We're done. No more elements.
                        }
                    } else {
                        // Cursor is not over yet.
                        if (options.abort || (options.limit && processed >= options.limit)) {
                            // Yet, we have processed enough elements. So, let's just skip.
                            if (bounds) {
                                if (options.conditions && options.conditions[index.keyPath]) {
                                    // We need to 'terminate' the cursor cleany, by moving to the end
                                    cursor.continue(options.conditions[index.keyPath][1] + 1);
                                } else if (options.index && (options.index.upper || options.index.lower)) {
                                    if (typeof options.index.order === 'string' &&
                                        options.index.order.toLowerCase() === 'desc') {
                                        cursor.continue(options.index.lower);
                                    } else {
                                        cursor.continue(options.index.upper);
                                    }
                                }
                            } else {
                                // We need to 'terminate' the cursor cleany, by moving to the end
                                cursor.continue();
                            }
                        }
                        else if (options.offset && options.offset > skipped) {
                            skipped++;
                            cursor.continue(); // We need to Moving the cursor forward
                        } else {
                            // This time, it looks like it's good!
                            if (!options.filter || typeof options.filter !== 'function' || options.filter(cursor.value)) {
                                processed++;
                                if (options.addIndividually) {
                                    collection.add(cursor.value);
                                } else if (options.clear) {
                                    const deleteRequest = store.delete(cursor.value[idAttribute]);
                                    deleteRequest.onsuccess = deleteRequest.onerror = event => {
                                        elements.push(cursor.value);
                                    };
                                } else {
                                    elements.push(cursor.value);
                                }
                            }
                            cursor.continue();
                        }
                    }
                };
            }
        }

        close() {
            // XXX PORT
            if(this.db){
                this.db.close();
            }
        }
    }

    forsta.messenger.IDBGateway = class IDBGateway {
        constructor(rpc) {
            this._rpc = rpc;
            this._rpc.addCommandHandler('db-gateway-init', this.onInitHandler.bind(this));
            this._initialized = new Map();
        }

        async onInitHandler(name, id, version) {
            if (this._initialized.has(name)) {
                console.warn("DB already initialized:", name);
                return;
            } else {
                const driver = new IDBDriver(name, id, version, this._rpc);
                await driver.init();
                this._initialized.set(name, driver);
            }
        }
    };
})();
