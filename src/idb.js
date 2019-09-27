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
