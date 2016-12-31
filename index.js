
/*
app.get('/', function(req, res){
  res.send('<h1>Hello world (new one, BBBCCC DDD)</h1>');
});
*/

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
   // In a browser, if you set url to localhost:3000, you'll get this page:
   //res.sendfile('indexCanvas.html');
});

// Put various client data and maps in a global.
var cD = {};
cD.userCount = 0;
// Map: userName[id]
cD.userName = {};
// Map: id[userName]
cD.id = {};
// Map: room[id]
cD.room = {};
// Map: hostID[roomName]
cD.hostID = {};


io.on('connection', function(socket){
   
   cD.userCount += 1;
   console.log('');
   console.log('Their count=' + io.engine.clientsCount + ', my count=' + cD.userCount + '.');
   
   // Two maps
   // First, name this user.
   cD.userName[socket.id] = 'u' + cD.userCount;
   cD.id['u' + cD.userCount] = socket.id;
   
   console.log('New client: '+ cD.userName[socket.id] +', '+ socket.id + '.');
   
   // Tell the new user their network name.
   io.to(socket.id).emit('your name is', cD.userName[socket.id]);
   
   // Now set up the various listeners.
   
   // Broadcast the incoming chat messages that come in.
   socket.on('chat message', function(msg){
      //console.log('message: ' + JSON.parse(msg).text);
      //console.log('message: ' + msg);
      console.log('Room:' + cD.room[ socket.id] + ', id:' + socket.id + ", name:" + cD.userName[socket.id] + ", msg:" + msg);
      
      // General emit to the room.
      io.to( cD.room[ socket.id]).emit('chat message', msg + " (" + cD.userName[socket.id] + ")");
      
      // Special emit, only to Host
      //io.to(hD.id).emit('chat message', 'OnlyToHost: ' + msg);
   });

   // Send mouse and keyboard states to the host client.
   socket.on('client-mK-event', function(msg){
      //console.log('Client Mouse: ' + JSON.parse(msg).mouseX_px + "," + JSON.parse(msg).mouseY_px);
      
      // Determine the id of the room-host for this client. Then send data to the host for that room.
      var hostID = cD.hostID[ cD.room[ socket.id]];
      //console.log('room='+cD.room[ socket.id]+", hID="+cD.hostID[ cD.room[ socket.id]]);
      
      io.to( hostID).emit('client-mk-event', msg);
   });
   
   socket.on('roomJoin', function(msg) {
      var roomName = msg;
      
      // Check to make sure the room has a host.
      if (cD.hostID[ roomName]) {
         socket.join(roomName);
         cD.room[ socket.id] = roomName;
         console.log('Room ' + roomName + ' joined by ' + cD.userName[ socket.id] + '.');
         
         io.to(socket.id).emit('chat message', 'You have joined room ' + cD.room[socket.id] + ' and your client name is '+cD.userName[socket.id]+'.');
         
         // Give the host the name of the new user so a new game client can be created.
         io.to( cD.hostID[ roomName]).emit('new-game-client', cD.userName[socket.id]);
         
         // Chat this to the host.
         io.to( cD.hostID[ roomName]).emit('chat message', cD.userName[socket.id]+ ' is a new client in '+roomName+'.');
         
      } else {
         io.to(socket.id).emit('chat message', 'Sorry, there is no host yet for room ' + roomName + '.');
      }
   });
   
   socket.on('roomJoinAsHost', function(msg) {
      var roomName = msg;
      
      // Should check if the room already has a host.
      if (cD.hostID[ roomName]) {
         io.to(socket.id).emit('chat message', 'Sorry, there is already a host for room ' + roomName + '.');
      } else {
         socket.join(roomName);
         cD.room[ socket.id] = roomName;
         console.log('Room ' + roomName + ' joined by ' + cD.userName[ socket.id] + '.');
         
         io.to(socket.id).emit('chat message', 'You have joined room ' + cD.room[socket.id] + ' and your client name is '+cD.userName[socket.id]+'.');
         
         // Set this user as the host for this room.
         cD.hostID[ cD.room[ socket.id]] = socket.id;
         
         console.log('User '+ cD.userName[ socket.id] +' identified as host for room ' + cD.room[ socket.id] + '.');
         io.to(socket.id).emit('chat message', 'You are the host of room ' + cD.room[ socket.id] + '.');
      }
   });
      
   socket.on('disconnect', function(){
      //cD.userCount -= 1;
      console.log(' ');
      var message = cD.userName[ socket.id] + ' has disconnected.';
      console.log( message);
      var hostID = cD.hostID[ cD.room[ socket.id]];
      io.to( hostID).emit('chat message', message);
      io.to( hostID).emit('client-disconnected', cD.userName[ socket.id]);
   });
   
});

http.listen(process.env.PORT, function(){
   console.log('listening on *:' + process.env.PORT);
});

