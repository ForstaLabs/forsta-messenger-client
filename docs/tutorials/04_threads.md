This tutorial assumes you have already followed:
- [Hello World Tutorial]{@tutorial 01_hello_world}
- [Ephemeral User Tutorial]{@tutorial 02_ephemeral_user}
- [Authenticated User Tutorial]{@tutorial 03_autheticated_user}

The full code for this tutorial is available at: {@link https://github.com/ForstaLabs/forsta-messenger-client/tree/master/examples/threads}

In the last tutorial we configured the client to connect, authenticate, and provision a regular user by way of API calls and the Forsta JWT. In this tutorial we will continue our exploration of the Forsta Messenger Client by introducing some thread operations.

Thread operations are built-in methods that can be used to control every aspect of threads: creation, distribution, attribute designation, and deletion are among the many actions that you will be familiar with by the end of this tutorial.

In order to illustrate just how useful thread operations are, let's imagine a scenario. It's the beginning of October, and the boss has put you in charge of planning a work Halloween party. How do you even start with such a task? Fresh off the previous three tutorials and itching to use your shiny new Forsta client, you decide to create a planning thread that includes the two departments that you plan to invite: sales and support.

Using the distribution tags for sales (@sales) and support (@support), and assuming you also want to add your own department devs (@devs), here's what the code for creating and opening your Halloween Party thread would look like:

```html
async function onLoaded(client) {
  const threadId = await client.threadMake("@sales + @devs + @support");
  await client.threadOpen(threadId); 
      
  displayMessenger();
}
```
    
This is a great start, but you might notice a few things are sub-optimal.
  1. The `threadMake()` operation doesn't check if a thread matching this distribution already exists. This becomes immediately clear if you run the code again, as a second thread is created.
  2. There is no title for your thread. This could be confusing for everyone who didn't already know you were going to add them.
  
This code fixes these problems by leveraging the `threadEnsure()` and the `threadSetAttribute()` operations. We've also created a default message using `threadSendMessage()` that hopefully explains things a bit better.

```html
async function onLoaded(client) {
  const threadId = await client.threadEnsure("@sales + @devs + @support");
  client.threadSetAttribute(threadId, "title", "Halloween Party");
  await client.threadOpen(threadId);
      
  client.threadSendMessage(threadId,"This is the planning thread for the halloween party! I know it's early, so tomorrow I'll archive this until a week before halloween.");
      
  displayMessenger();
}
```
    
Next, let's focus on actualizing that promise to archive the thread from tomorrow until a week before halloween. This can be done via the `threadArchive()` and the `threadRestore()` commands as well as a few lines of additional javascript. To make things a bit simpler, let's assume that the day that this tutorial takes place on is October 5th (10/5).

```html
async function onLoaded(client) {
  const threadId = await client.threadEnsure("@sales + @devs + @support");
  client.threadSetAttribute(threadId, "title", "Halloween Party");
  await client.threadOpen(threadId);
      
  client.threadSendMessage(threadId,"This is the planning thread for the halloween party! I know it's early, so tomorrow I'll archive this until a week before halloween.");
      
  var d = new Date();
  var month = d.getMonth() + 1;
  var day = d.getDate();

  if (month == 10 && day == 6){
    client.threadArchive(threadId);
  }
  if (month == 10 && day == 24){
    client.threadRestore(threadId);
  }
      
  displayMessenger();
}
```
    
Fast forward until October 24 (10/24). The thread has been un-archived and people are ready to get planning. But wait! Thanks to a multi-team project, you've become quite friendly with the marketing department (@marketing) over the past few weeks and you want to invite them to the halloween party. In order to make room for them you uninvite the sales team who, due to the same project, have fallen out of favor with the devs. Thankfully the `threadAmendDistribution()` and `threadRepealDistribution()` commands exist.

```html
async function onLoaded(client) {
  const threadId = await client.threadEnsure("@sales + @devs + @support");
  client.threadSetAttribute(threadId, "title", "Halloween Party");
  await client.threadOpen(threadId);
      
  client.threadSendMessage(threadId,"This is the planning thread for the halloween party! I know it's early, so tomorrow I'll archive this until a week before halloween.");
      
  client.threadAmendDistribution(threadId,"@marketing");
  client.threadRepealDistribution(threadId,"@sales");
      
  var d = new Date();
  var month = d.getMonth() + 1;
  var day = d.getDate();

  if (month == 10 && day == 6){
    client.threadArchive(threadId);
  }
  if (month == 10 && day == 24){
    client.threadRestore(threadId);
  }
      
  displayMessenger();
}
```

Halloween also happens to fall on your developer coworker Gary's (@gary) birthday. You want to do something special for him, so you decide to create and open a new thread with threadId2 that includes all the devs minus Gary. To prevent Gary from accidentally seeing the chat over someone's shoulder, you also give your new thread a message expiration time of 5 seconds using `threadSetExpiration()`.

```html
async function onLoaded(client) {
  const threadId = await client.threadEnsure("@sales + @devs + @support");
  const threadId2 = await client.threadEnsure("@devs - @gary");
      
  client.threadSetAttribute(threadId, "title", "Halloween Party");
  client.threadSetAttribute(threadId2, "title", "Secret Stuff");
      
  await client.threadOpen(threadId2);
  client.threadSetExpiration(threadId2, 5);
      
  client.threadSendMessage(threadId,"This is the planning thread for the halloween party! I know it's early, so tomorrow I'll archive this until a week before halloween.");
  client.threadSendMessage(threadId2,"This is the planning thread for Gary's surprise party. Dont let him see this!");
      
  client.threadAmendDistribution(threadId,"@marketing");
  client.threadRepealDistribution(threadId,"@sales");
      
  var d = new Date();
  var month = d.getMonth() + 1;
  var day = d.getDate();

  if (month == 10 && day == 6){
    client.threadArchive(threadId);
  }
  if (month == 10 && day == 24){
    client.threadRestore(threadId);
  }
      
  displayMessenger();
}
```

The date is now November 1 (11/1) and the party is over. Everything went great! The only thing left to do is clean up all of these now deprecated chats. There are two ways to do this using thread operations. We already went over `threadArchive()`, which preserves the thread in case you would like to revisit it in the future. Since there's not much use in retaining the party planning messages, we likely want to use the other option: `threadExpunge()`. `threadExpunge()` destroys the chat completely and securely, erasing every trace of it ever having existed. Let's automate this process in our date checkers.

```html
async function onLoaded(client) {
  const threadId = await client.threadEnsure("@sales + @devs + @support");
  const threadId2 = await client.threadEnsure("@devs - @gary");
      
  client.threadSetAttribute(threadId, "title", "Halloween Party");
  client.threadSetAttribute(threadId2, "title", "Secret Stuff");
      
  await client.threadOpen(threadId2);
  client.threadSetExpiration(threadId2, 5);
      
  client.threadSendMessage(threadId,"This is the planning thread for the halloween party! I know it's early, so tomorrow I'll archive this until a week before halloween.");
  client.threadSendMessage(threadId2,"This is the planning thread for Gary's surprise party. Dont let him see this!");
      
  client.threadAmendDistribution(threadId,"@marketing");
  client.threadRepealDistribution(threadId,"@sales");
      
  var d = new Date();
  var month = d.getMonth() + 1;
  var day = d.getDate();

  if (month == 10 && day == 6){
    client.threadArchive(threadId);
  }
  if (month == 10 && day == 24){
    client.threadRestore(threadId);
  }
  if (month == 11 && day == 1){
    client.threadExpunge(threadId);
    client.threadExpunge(threadId2);
  }
      
  displayMessenger();
}
```

