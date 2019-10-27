This tutorial assumes you have already followed:

- [Hello World Tutorial]{@tutorial 01_hello_world}
- [Ephemeral User Tutorial]{@tutorial 02_ephemeral_user}

Complete code for this tutorial is available at: {@link https://github.com/ForstaLabs/forsta-messenger-client/tree/master/examples/authenticated_user}

In the last tutorial we configured the client to use an ephemeral user who is
created and logged in based on the org ephemeral token. However in production
systems we recommend creating Forsta users using the Forsta Atlas API and 
libraries. In this tutorial we will discuss how to connect an authenticated user.

You can create a user using either:

- [Forsta Console]{@link https://app.forsta.io/people}
- [Atlas API]{@link https://atlas.forsta.io/doc/}

For a user to authenticate with the Forsta Messenger Client they need to provide
a [Forsta JWT]{@link external:JWT}.  

Once you have a [Forsta JWT]{@link external:JWT} start with the following code that authenticates a user
using the Forsta Messenger Client:

```html
<html>
  <head>
    <script src="https://forstalabs.github.io/forsta-messenger-client/dist/forsta-messenger-client.min.js"></script>
  </head>

  <body>
    <!-- Div that contains the Forsta messenger client -->
    <div id="my-messenger" style="width: 80%; height: 80%; visibility: hidden;"></div>
  </body>

  <script>
    function displayMessenger() {
      const messenger = document.getElementById("my-messenger");
      messenger.style.visibility = "visible";
    }
    
    async function onLoaded(client) {
      const threadId = await client.threadMake("@userinyourorg");
      await client.threadOpen(threadId);
      
      displayMessenger();
    }

    // Configure the Forsta messenger client to use the div with id my-messenger
    // And connect as an ephemeral user using the ephemeral chat token
    const myClient = new forsta.messenger.Client(document.getElementById('my-messenger'),
      { jwt: 'server generated jwt' },
      { onLoaded: onLoaded, showNav: true, showHeader: true });
  </script>
</html>

```

If you load this code for the first time in a browser you will discover that nothing displays.
This is because authenticated users on new systems must first provision their encryption key.
The `onLoaded` function fires after provisioning. To display the messenger when provisioning is
required there are three provisioning listeners. Add the following functions to your script:

```html
function onProvisioningRequired() {
  displayMessenger();
}

function onProvisioningError() {
  alert("Provisioning Failed!");
}

function onProvisioningDone() {
  alert("Provisioning Finished!");
}
```

Then after the `myClient =` line add the following to set the event listeners:

```html
myClient.addEventListener('provisioningrequired', onProvisioningRequired);
myClient.addEventListener('provisioningerror', onProvisioningError);
myClient.addEventListener('provisioningdone', onProvisioningDone);
```

Now, try loading the page. The provisioning listener will trigger the messenger to display.
You have the option to either:

- Generate new key
- Import a previous key from a currently running client

You can read more about the need to provision a key on the [System Life Cycle page]{@link https://docs.forsta.io/docs/system-life-cycle} of the Forsta docs.


