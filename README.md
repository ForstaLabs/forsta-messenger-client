forsta-messenger-client
========
Client library for integrating a Forsta messenger into your web application.


[![NPM](https://img.shields.io/npm/v/forsta-messenger-client.svg)](https://www.npmjs.com/package/forsta-messenger-client)
[![License](https://img.shields.io/npm/l/forsta-messenger-client.svg)](https://github.com/ForstaLabs/forsta-messenger-client)
[![Docs](https://img.shields.io/badge/docs-api-lightgrey.svg)](https://forstalabs.github.io/forsta-messenger-client/docs/index.html)


About
--------
This library can be bundled into your web application to integrate a Forsta
Messenger client into your web application.


Install
--------
The forsta-messenger-client should be included with your webpages javascript.  It can be
added as its own script tag or included with your existing javascript using some bundling
software of your choosing, e.g. grunt, webpacket etc.  Depending on your desired installation
and bundling method there are a few ways to get the forsta-messenger-client.


### From public CDN (standalone script tag) [easy]
Add the following script tag to your site;  Note that this script will be the latest
version of the forsta-messenger-client and you can not choose when version changes
happen.

```html
<script src="https://forstalabs.github.io/forsta-messenger-client/dist/forsta-messenger-client.min.js"></script>
```

### NPM (for bundler based installs) [medium]:

    npm install forsta-messenger-client

Then include the `node_modules/forsta-messenger-client/dist/forsta-messenger-client.js` file
into your javascript bundle.


### Building from source [hard]:

    git clone https://github.com/ForstaLabs/forsta-messenger-client
    cd forsta-messenger-client
    npm install

To generate a build from the `src/` files run:

    npm run build

To generate docs:

    npm run docs

Docs are located in the `docs/forsta-messenger-client/<version>` folder.


Usage:
--------
See our generated reference docs for full usage details:
https://forstalabs.github.io/forsta-messenger-client/docs/index.html


License
--------
Licensed under the MIT License.

* Copyright 2019 Forsta Inc.
