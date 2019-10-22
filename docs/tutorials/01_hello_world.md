The `forsta-messenger-client` JavaScript API allows you to run and control a
Forsta Messenger client inside your own website.  Seamless integration is possible so your
web application is instantly upgraded to have secure end to end encrypted messaging capabilities.

To get started you need to include the Forsta messenger client JavaScript file into your website.
There are several choices for how you bundle or load the library.  The simplest method is to
add a `<script>` tag to your own HTML source that sets the `src` attribute to a publicly available
distribution.  We'll just use the GitHub hosted distribution for this example, but you could just
as easily install the library from NPM and bundle the `dist/forsta-messenger-client.min.js` with your
existing web JS.

```html
<html>
    <head>
        <script src="https://forstalabs.github.io/forsta-messenger-client/dist/forsta-messenger-client.min.js"></script>
    </head>
</html>
```


Once the JavaScript library is included in your website you will have access to the
{@link forsta.messenger} namespace in your `window` object.  The first thing we want to
look at is the {@link forsta.messenger.Client} class which is the primary interface for
loading and controlling the messenger client.

We need to instantiate this class with a few arguments.  The first is the HTML element
where we should load the messenger.  The second argument is a {@link ClientAuth} configuration
object used for controlling user authentication (or creation). The third is a {@link ClientOptions}
configuration object used for setting the client's initial state.


```html
<body>
    <div id="my-messenger" style="width: 80%; height: 80%;"></div>
</body>

<script>
    const myClient = new forsta.messenger.Client(document.getElementById('my-messenger'),
                                                 {orgEphemeralToken: 'TESTING'},
                                                 {showNav: true, showHeader: true});
</script>
```

For more information on the org ephemeral token: {@link https://app.forsta.io/authtokens}


Now that your client is instantiated you should see a messenger loaded into the div tag provided in
the first argument.  The `myClient` variable provides access to events and control functions.

Sample code is available at:
{@link https://github.com/ForstaLabs/forsta-messenger-client/tree/master/examples/hello}
