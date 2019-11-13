Please see the [Hello World Tutorial]{@tutorial 01_hello_world} for initial setup of the Forsta Messenger Client. Complete code for this tutorial is available at:
{@link https://github.com/ForstaLabs/forsta-messenger-client/tree/master/examples/ephemeral}

The Forsta Messenger Client can be used with two different types of users:

- Ephemeral - Short lived users created via API or by authenticating with the Forsta Ephemeral Chat token
- Authenticated Users - Users generated via the API without an expiration or at {@link https://app.forsta.io}

In this tutorial we will configure the client to create an ephemeral user who can chat with an authenticated
user who has the tag @support.

We will start with the following base code setting up the Forsta Messenger Client in a hidden div.
This prevents the user from seeing the client until setup is complete.

```html
<html>
  <head>
    <script src="https://forstalabs.github.io/forsta-messenger-client/dist/forsta-messenger-client.min.js"></script>
  </head>

  <body>
    <div id="my-messenger" style="width: 80%; height: 80%; visibility: hidden;"></div>
  </body>

  <script>
    const myClient = new forsta.messenger.Client(document.getElementById('my-messenger'),
      { orgEphemeralToken: 'TESTING' },
      { });
  </script>
</html>

```

The Forsta Messenger Client includes several callbacks that can be configured when the
client is initialized. In this case we will set the `onLoaded` callback to do the following:

- Create a new conversation thread with a tagged users
- Open the thread in the client
- Display the client once the thread is available

First, create the `onLoaded` callback. It uses the `threadMake` command to generate a new thread
between the ephemeral user and one or more users defined by their tags. For more information
on using tags see [TagExpression]{@link TagExpression}. Once a thread has been
created, it opens the thread in the client window and changes the visibility on the div to be visible.

```html
  async function onLoaded(client) {
    threadId = await client.threadMake("@support");
    await client.threadOpen(threadId);
      
    const messenger = document.getElementById("my-messenger");
    messenger.style.visibility = "visible";
  }
```

Next, configure the client to use the callback by replacing the initialization script
with the following:

```html
<script>
  const myClient = new forsta.messenger.Client(document.getElementById('my-messenger'),
    { orgEphemeralToken: 'TESTING' },
    { onLoaded: onLoaded });
</script>
```

At this point, the code creates and logs in an ephemeral user and connects them
to a messge thread with the user defined by the @support tag.

As a final step we can set details about the Ephemeral User. Add to the initialization 
script the settings for {@link EphemeralUserInfo}.

```html
<script>
  const myClient = new forsta.messenger.Client(document.getElementById('my-messenger'),
    { orgEphemeralToken: 'TESTING' },
    { onLoaded: onLoaded,
      ephemeralUserInfo: {
        firstName: "Support",
        lastName: "Customer",
        salt: "1234"
    }});
</script>
```

Now, the ephemeral user will show up in the conversation as Support Customer. The salt
should be set to a random uuid to guarantee a new user is generated for each ephemeral user.
 

