// Node Server Script
// server.js
// Version 2.1.04 (9:19 PM Tue July 17, 2018)
// Written by: James D. Miller

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const port = process.env.PORT || 3000;

app.get('/', function(req, res) {
   // In a browser, if you set the URL to localhost:3000, you'll get this page:
   res.sendfile('links.html');
});

// Put various client data and maps in a global.
var cD = {};
cD.userIndex = 0;

// Map: userName[ socket.id]
cD.userName = {};
cD.nickName = {};

// Map: id[ userName]
cD.id = {};

// Map: room[ socket.id]
cD.room = {};

// Map: hostID[ roomName]
cD.hostID = {};


// Miscellaneous support functions...

function setDefault( theValue, theDefault) {
   // Return the default if the value is undefined.
   return (typeof theValue !== "undefined") ? theValue : theDefault;
}

function removeUserFromMaps( clientID) {
   // Do this first, before removing this user from the maps.
   // Check to see if this is the host.
   var hostID = cD.hostID[ cD.room[ clientID]];
   if (hostID == clientID) {
      delete cD.hostID[ cD.room[ clientID]];
   }
   
   // In a similar way, make use of the userName map before removing the user from userName.
   delete cD.id[ cD.userName[ clientID]];
   delete cD.userName[ clientID];
   
   // Not every user will have a nick name.
   if (cD.nickName[ clientID]) delete cD.nickName[ clientID];
   
   // The room map was used above. Now it's ok to remove the user from the room map.
   delete cD.room[ clientID];
}

function setDisplayName( clientID, mode) {
   var displayNameString;
   if (cD.nickName[clientID]) {
      if (mode == 'comma') {
         displayNameString = cD.nickName[clientID] + ', ' + cD.userName[clientID];
      } else if (mode == 'prens') {
         displayNameString = cD.nickName[clientID] + ' (' + cD.userName[clientID] + ')';
      }
   } else {
      displayNameString = cD.userName[clientID];
   }
   return displayNameString;
}


// Socket.io stuff...

io.on('connection', function(socket) {
   // Example of how to parse out the query string if it is sent in the connection attempt from the client.
   console.log("");
   console.log("Connection starting...");
   console.log("mode=" + socket.handshake.query['mode'] + ", current name=" + socket.handshake.query['currentName'] + ", nickName=" + socket.handshake.query['nickName']);
   
   // Normal initial connection
   if (socket.handshake.query['mode'] == 'normal') {
      cD.userIndex += 1;
      var user_name = 'u' + cD.userIndex;
   // If re-connecting, re-use the current user name that comes in via the query string.
   } else if (socket.handshake.query['mode'] == 're-connect') {
      var user_name = socket.handshake.query['currentName'];
   }
   var nick_name = socket.handshake.query['nickName'];
   
   // Two maps
   cD.userName[ socket.id] = user_name;
   if (nick_name) cD.nickName[ socket.id] = nick_name;
   cD.id[ user_name] = socket.id;
   
   console.log('');
   console.log('Their count=' + io.engine.clientsCount + ', my index=' + cD.userIndex + ', names=' + Object.keys(cD.userName).length + ', nick names=' + Object.keys(cD.nickName).length);
   
   console.log('New client: '+ cD.userName[socket.id] +', '+ socket.id + '.');
   
   // Tell the new user their network name.
   io.to(socket.id).emit('your name is', JSON.stringify({'name':cD.userName[socket.id], 'nickName':nick_name}));
   
   // Now set up the various listeners. I know this seems a little odd, but these listeners
   // need to be defined each time this connection event fires, i.e. for each socket.
   
   // Echo test...
   socket.on('echo-from-Client-to-Server', function(msg) {
      if (msg == 'server') {
         // This bounces off the SERVER and goes right back to the client.
         io.to(socket.id).emit('echo-from-Server-to-Client', 'server');
         
      } else if (msg == 'host') {
         // Send this first to the host (the scenic route). Include the id of the client so that we know where to send it
         // when it bounces off the host.
         io.to( cD.hostID[ cD.room[ socket.id]]).emit('echo-from-Server-to-Host', socket.id);
      }
      
   });
   socket.on('echo-from-Host-to-Server', function(msg) {
      var socket_id = msg;
      // Now that this has come back from the HOST, complete the trip and send this to the originating client.
      io.to(socket_id).emit('echo-from-Server-to-Client', 'host');
   });
   
   
   // Broadcast the incoming chat message to everyone in the sender's room.
   socket.on('chat message', function(msg) {
      // General emit to the room. Note: io.to and io.in do the same thing.
      io.to( cD.room[ socket.id]).emit('chat message', msg + " (" + setDisplayName(socket.id, 'comma') + ")");
   });
   // Broadcast the incoming chat message to everyone in the sender's room, except the sender.
   socket.on('chat message but not me', function(msg) {
      // Emit to everyone in the sender's room except the sender.
      socket.to( cD.room[ socket.id]).emit('chat message',  msg + " (" + setDisplayName(socket.id, 'comma') + ")");
   });
   
   
   // Signaling in support of WebRTC.
   socket.on('signaling message', function(msg) {
      var signal_message = JSON.parse(msg);
      
      if (signal_message.to == 'host') {
         var target = cD.hostID[ cD.room[ socket.id]];
      } else {
         var target = cD.id[ signal_message.to];
      }
      
      // Relay the message (emit) to the target user.
      io.to( target).emit('signaling message', msg);
   });
   
   // General control message (note: same structure as the above handler for signaling messages)
   socket.on('control message', function(msg) {
      var control_message = JSON.parse(msg);
      
      if (control_message.to == 'host') {
         var target = cD.hostID[ cD.room[ socket.id]];
      } else if (control_message.to == 'room') {
         var target = cD.room[ socket.id];
      } else if (control_message.to == 'roomNoSender') {
         var target = cD.room[ socket.id];
         socket.to( target).emit('control message', msg);
         return;
      } else {
         var target = cD.id[ control_message.to];
      }
      
      // Relay the message (emit) to the target user(s).
      io.to( target).emit('control message', msg);
   });
   
   // Send mouse and keyboard states to the host client.
   socket.on('client-mK-event', function(msg) {
      // Determine the id of the room-host for this client. Then send data to the host for that room.
      // socket.id --> room --> room host.
      var hostID = cD.hostID[ cD.room[ socket.id]];
      
      // StH: Server to Host
      io.to( hostID).emit('client-mK-StH-event', msg);
   });
   
   socket.on('roomJoin', function(msg) {
      var msgParsed = JSON.parse( msg);
      
      var roomName = setDefault( msgParsed.roomName, null);
      var requestStream = setDefault( msgParsed.requestStream, false);
      var player = setDefault( msgParsed.player, null);
      var hostOrClient = setDefault( msgParsed.hostOrClient, 'client');
      
      nickName = cD.nickName[ socket.id];
      var displayName = setDisplayName( socket.id, 'prens');
      
      if (hostOrClient == 'client') {
         // Check to make sure the room has a host.
         if (cD.hostID[ roomName]) {
            socket.join(roomName);
            cD.room[ socket.id] = roomName;
            console.log('Room ' + roomName + ' joined by ' + cD.userName[ socket.id] + '.');
            
            // Send message to the individual client that is joining the room.
            io.to(socket.id).emit('room-joining-message', 'You have joined room ' + cD.room[socket.id] + ' and your client name is '+ displayName +'.');
            
            // Message to the room host.
            // Give the host the name of the new user so a new game client can be created. This is where "player" and "nickName" info gets
            // sent to the host. Notice this is not done, or needed, in the host block below.
            io.to( cD.hostID[ roomName]).emit('new-game-client', 
               JSON.stringify({'clientName':cD.userName[socket.id], 'requestStream':requestStream, 'player':player, 'nickName':nickName}));
            
            // Chat message to the host.
            io.to( cD.hostID[ roomName]).emit('chat message', displayName + ' is a new client in room '+roomName+'.');
            
         } else {
            io.to(socket.id).emit('room-joining-message', 'Sorry, there is no host yet for room ' + roomName + '.');
         }
      
      } else if (hostOrClient == 'host') {
         // Should check if the room already has a host.
         if (cD.hostID[ roomName]) {
            // Send warning to the client that is attempting to host.
            io.to(socket.id).emit('room-joining-message', 'Sorry, there is already a host for room ' + roomName + '.');
            
         } else {
            socket.join(roomName);
            cD.room[ socket.id] = roomName;
            console.log('Room ' + roomName + ' joined by ' + cD.userName[ socket.id] + '.');
            
            // General you-have-joined-the-room message.
            io.to(socket.id).emit('room-joining-message', 'You have joined room ' + cD.room[socket.id] + ' and your client name is '+ displayName +'.');
            
            // Set this user as the host for this room.
            cD.hostID[ cD.room[ socket.id]] = socket.id;
            console.log('User '+ displayName +' identified as host for room '+ cD.room[ socket.id] + '.');
            
            // An oh-by-the-way "you are the host" message.
            io.to(socket.id).emit('room-joining-message', 'You are the host of room ' + cD.room[ socket.id] + '.');
         }
      }
   });
   
   // This "disconnect" event is fired by the server.
   socket.on('disconnect', function() {
      if (cD.userName[ socket.id]) {
         
         var displayName = setDisplayName( socket.id, 'prens');
         
         // Report at the server.
         console.log(' ');
         var message = displayName + ' has disconnected.';
         console.log( message + ' (by self, ' + socket.id + ').');
         
         // Report to the room host.
         var hostID = cD.hostID[ cD.room[ socket.id]];
         io.to( hostID).emit('chat message', message+'.');
         io.to( hostID).emit('client-disconnected', cD.userName[ socket.id]);
         
         // Remove this user from the maps.
         removeUserFromMaps( socket.id);
      }
   });
   
   socket.on('clientDisconnectByHost', function(msg) {
      var clientName = msg;
      var clientID = cD.id[ clientName];
      
      // Send disconnect message to the client.
      io.to( clientID).emit('disconnectByServer', clientName);
      
      // Don't do the following. It will disconnect the host socket. Not what we want here!
      //socket.disconnect();
   });
   
   socket.on('okDisconnectMe', function(msg) {
      // This event indicates that the non-host client has gotten the clientDisconnectByHost message (see above) and
      // agrees to go peacefully.
      var clientName = msg;
      var clientID = cD.id[ clientName];
      
      // Report this at the server.
      console.log(' ');
      var message = clientName + ' has disconnected';
      console.log( message + ' (by host, '+clientID+').');
      
      // Report to the room host.
      var hostID = cD.hostID[ cD.room[ clientID]];
      io.to( hostID).emit('chat message', message);
      io.to( hostID).emit('client-disconnected', clientName);
      
      // Remove this user from the maps.
      removeUserFromMaps( socket.id);
      
      //Finally, go ahead and disconnect this client's socket.
      socket.disconnect();
   });

   socket.on('shutDown-p2p-deleteClient', function( msg) {
      var clientName = msg;
      var clientID = cD.id[ clientName];
      var hostID = cD.hostID[ cD.room[ clientID]];
      io.to( hostID).emit('shutDown-p2p-deleteClient', clientName);   
   });
   
   socket.on('command-from-host-to-all-clients', function( msg) {
      // General emit to the room.
      io.to( cD.room[ socket.id]).emit('command-from-host-to-all-clients', msg);
   });
   
});

//http.listen(port, function() {
//   console.log('listening on *:' + port);
//});
http.listen(port, {path:"/some/path", cookie:false});

