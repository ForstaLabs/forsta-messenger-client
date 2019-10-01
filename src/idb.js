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
            console.warn("updateHandler:", kwargs);
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
            console.warn("readHandler:", kwargs);
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
            console.warn("deleteHandler:", kwargs);
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
            console.warn("clearHandler:", kwargs);
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
            console.warn("queryHandler:", kwargs);
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
            console.warn("countHandler:", kwargs);
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

        close() {
            // XXX PORT
            console.error('XXX PORT');
            if (this.db) {
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

        async onInitHandler(kwargs) {
            if (this._initialized.has(kwargs.name)) {
                console.error("DB already initialized:", kwargs.name);
                return;
            } else {
                const driver = new IDBDriver(kwargs.name, kwargs.id, kwargs.version, this._rpc);
                await driver.init();
                this._initialized.set(kwargs.name, driver);
            }
        }
    };
})();
