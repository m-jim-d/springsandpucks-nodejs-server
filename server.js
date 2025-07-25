// server.js
// July 22, 2025

/*
Copyright 2025 James D. Miller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/*
Socket.io Server
Works both locally with HTTPS and on Heroku with their SSL handling.
 
This server detects the environment and uses the appropriate setup:
- In production (Heroku): Uses HTTP (Heroku handles SSL)
- In development: Uses HTTPS with self-signed certificates
 
Includes full multi-player functionality:
- Host and client connection management
- Room joining and management
- Chat messaging
- Signaling for WebRTC
- Idle timeout handling 
*/

const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Detect environment
const isProduction = process.env.NODE_ENV === 'production' || process.env.HEROKU;
const PORT = process.env.PORT || (isProduction ? 3000 : 3443);

console.log(`Starting server in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);

// Create server based on environment
let server;

if (isProduction) {
   // Heroku environment: use standard HTTP server (Heroku handles SSL)
   server = require('http').createServer(app);
   console.log('Running in production mode (Heroku handles SSL)');
   
} else {
   // Local development: use HTTPS with self-signed certificates
   // SSL directory
   const sslDir = path.join(__dirname, 'ssl');

   // Create SSL directory if it doesn't exist
   if (!fs.existsSync(sslDir)) {
      console.log('Creating SSL directory...');
      fs.mkdirSync(sslDir, { recursive: true });
   }

   // Check if certificates exist, if not generate them
   const keyPath = path.join(sslDir, 'key.pem');
   const certPath = path.join(sslDir, 'cert.pem');

   if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      console.log('Generating self-signed certificates...');
      try {
         // Generate certificates using OpenSSL
         const openSSLCommand = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`;
         execSync(openSSLCommand);
         console.log('Self-signed certificates generated successfully.');
      } catch (error) {
         console.error('Failed to generate certificates using OpenSSL. Using built-in self-signed certificate generation.');
         
         // Alternative: Generate a simple self-signed certificate using Node.js
         const selfsigned = require('selfsigned');
         const attrs = [{ name: 'commonName', value: 'localhost' }];
         const pems = selfsigned.generate(attrs, { days: 365 });
         
         fs.writeFileSync(keyPath, pems.private);
         fs.writeFileSync(certPath, pems.cert);
         console.log('Self-signed certificates generated using Node.js.');
      }
   }

   // HTTPS options
   const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
   };

   server = require('https').createServer(httpsOptions, app);
   console.log('Running in development mode with self-signed certificates');
}

// Socket.io with CORS options
let options = { 
   'cors': {
      'origin': "*",
      'methods': ["GET", "POST", "OPTIONS"],
      'credentials': false,
      'transports': ['websocket', 'polling']
   },
   'allowEIO3': true
};

const io = require('socket.io')(server, options);

// Add CORS headers for Express routes
app.use(function(req, res, next) {
   res.header("Access-Control-Allow-Origin", "*");
   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
   res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
   next();
});

// Serve static files
app.use(express.static('.'));

// Add routes for testing
app.get('/', function(req, res) {
   // In a browser, if you set the URL to localhost:3000, you'll get this page:
   res.sendFile('links.html', {'root': '.'});   
});

app.get('/status', function(req, res) {
   res.json({
      status: 'ok',
      secure: !isProduction,
      environment: isProduction ? 'production' : 'development',
      timestamp: new Date().toISOString()
   });
});

// Put various client data (cD) and maps in a global.
var cD = {};
cD.connectionIndex = 0;
cD.nameIndex = 0;

// Map: userName[socket.id]
cD.userName = {};
cD.nickName = {};
cD.teamName = {};

// Map: id[userName]
cD.id = {};

// Map: room[socket.id], i.e. roomName
cD.room = {};

// Map: hostID[roomName]
cD.hostID = {};

// After restarting the server, send info to all remaining connections.
setTimeout(function() {
   io.emit("chat message", "The server has started, restarted, or has been awakened. <br><br>" +
                           "If this is a restart, it's possible that all prior connections will reconnect automatically, or you may only need to press the connect button. <br><br>" +
                           "If there are problems, clients and hosts should refresh their pages. Hosts should indicate rooms and reconnect. Then clients should reconnect to those rooms.");
   console.log("\n" + "info sent to clients: server has restarted");
}, 5000);

// Miscellaneous support functions...

function setDefault(theValue, theDefault) {
   // Return the default if the value is undefined.
   return (typeof theValue !== "undefined") ? theValue : theDefault;
}

function removeUserFromMaps(clientID) {
   // Do this first, before removing this user from the maps.
   // Check to see if this is the host.
   var hostID = cD.hostID[cD.room[clientID]];
   if (hostID == clientID) {
      delete cD.hostID[cD.room[clientID]];
   }
   
   // In a similar way, make use of the userName map before removing the user from userName.
   delete cD.id[cD.userName[clientID]];
   delete cD.userName[clientID];
   
   // Not every user will have a nick name.
   if (cD.nickName[clientID]) delete cD.nickName[clientID];
   if (cD.teamName[clientID]) delete cD.teamName[clientID];
   
   // The room map was used above. Now it's ok to remove the user from the room map.
   delete cD.room[clientID];
}

function setDisplayName(clientID, mode) {
   var displayNameString, userName;
   
   var hostID = cD.hostID[cD.room[clientID]];
   if (hostID == clientID) {
      userName = 'host';
   } else {
      userName = cD.userName[clientID];
   }
   
   if (cD.nickName[clientID]) {
      let teamString = (cD.teamName[clientID]) ? "."+cD.teamName[clientID] : "";
      if (mode == 'comma') {
         displayNameString = cD.nickName[clientID] + teamString + ', ' + userName;
      } else if (mode == 'prens') {
         displayNameString = cD.nickName[clientID] + teamString + ' (' + userName + ')';
      }
   } else {
      displayNameString = userName;
   }
   return displayNameString;
}

function countValidNames(nameMap) {
   let count = 0;
   for (let socket_id in nameMap) {
      let name = nameMap[socket_id];
      if (name && name !== "" && name !== null && name !== undefined) {
         count++;
      }
   }
   return count;
}

function connectionInfo() {
   let infoStr = 'sockets=' + io.engine.clientsCount + ', connection acts=' + cD.connectionIndex + 
                  ', names=' + Object.keys(cD.userName).length + ', nick names=' + countValidNames(cD.nickName) + 
                  ', team names=' + countValidNames(cD.teamName);
   return infoStr;
}

function nameReport(names, socket_id_target) {
   let nickNameList = "", nickNameArray = [];
   let teamNameList = "", teamNameArray = [];
   let teamMemberCount = 0;
   
   // Remove trailing numbers.
   let nickNameNoNumbers, teamNameNoNumbers;
   nickNameNoNumbers = names.nickName.replace(/\d+$/, "");
   if (names.teamName) teamNameNoNumbers = names.teamName.replace(/\d+$/, "");
   
   for (let socket_id in cD.userName) {
      let nickNameRaw = cD.nickName[socket_id];
      if (nickNameRaw && nickNameRaw.startsWith(nickNameNoNumbers) && (!nickNameArray.includes(nickNameRaw))) {
         // Use socket_id_target to identify current user (to be bold). Better than using names; server increments similar nicknames.
         let nickNameFormatted = (socket_id == socket_id_target) ? "<strong>"+ nickNameRaw +"</strong>" : nickNameRaw;
         nickNameList += nickNameFormatted + ", ";
         nickNameArray.push(nickNameRaw);
      }
      
      let teamNameRaw = cD.teamName[socket_id];
      if (names.teamName && (teamNameRaw == names.teamName)) teamMemberCount++;
      if (teamNameRaw && teamNameRaw.startsWith(teamNameNoNumbers) && (!teamNameArray.includes(teamNameRaw))) {
         // Use names.teamName to identify current user (socket_id_target would also work).
         let teamNameFormatted = (teamNameRaw == names.teamName) ? "<strong>"+ teamNameRaw +"</strong>" : teamNameRaw;
         teamNameList += teamNameFormatted + ", ";
         teamNameArray.push(teamNameRaw);
      }
   }
   nickNameList = nickNameList.slice(0,-2);
   teamNameList = teamNameList.slice(0,-2);
   
   return {'nickName':nickNameList,'teamName':teamNameList, 'teamMemberCount':teamMemberCount};
}

function roomReport() {
   let usersByRoom = connectionInfo();
   
   for (let roomInMap in cD.hostID) {
      usersByRoom += "<br>clients in " + roomInMap + " = ";
      for (let socket_id in cD.userName) {
         let userName = cD.userName[socket_id];
         let userNickName = cD.nickName[socket_id];
         let userTeamName = cD.teamName[socket_id];
         let teamString = (userTeamName) ? "."+userTeamName : "";
         if (cD.room[socket_id] == roomInMap) {
            // if this name is the host's name
            if (userName == cD.userName[cD.hostID[roomInMap]]) {
               if (userNickName) {
                  usersByRoom += userName + "(h-" + userNickName + teamString + "), ";
               } else {
                  usersByRoom += userName + "(h), ";
               }
            } else {
               if (userNickName) {
                  usersByRoom += userName + "(" + userNickName + teamString + "), ";
               } else {
                  usersByRoom += userName + ", ";
               }
            }
         }
      }
      // remove the trailing ", "
      usersByRoom = usersByRoom.slice(0, -2);
   }

   return usersByRoom;
}

// Not using this currently.
function highestNameNumber() {
   let maxNumber = 0;
   if (Object.keys(cD.userName).length > 0) {
      for (let socket_id in cD.userName) {
         let userName = cD.userName[socket_id];
         // remove the leading "u" in the name
         let numberInName = userName.slice(1);
         maxNumber = Math.max(numberInName, maxNumber);
      }
   }
   return maxNumber;
}

function nameInUse(nameToCheck, nameMap) {
   for (let socket_id in nameMap) {
      if (nameMap[socket_id] == nameToCheck) {
         return true;
      }
   }
   return false;
}

function disconnectClientsInOneRoom(roomName) {
   for (let socket_id in cD.userName) {
      // Apply to users in the room, but not the room host.
      if (cD.room[socket_id] == roomName) {
         if (socket_id != cD.hostID[roomName]) {
            io.to(socket_id).emit('disconnectByServer', {'name':cD.userName[socket_id], 'originator':'host'});
         }
      }
   }
}

// This can be used when debugging (see commented call).
function disconnectClientsInAllRooms() {
   for (let roomInMap in cD.hostID) {
      disconnectClientsInOneRoom(roomInMap);
   }
}

// Socket.io connection handler
io.on('connection', function(socket) {
   // Showing the usage of the auth object if it is sent in the connection attempt from the client.
   console.log("");
   console.log("Connection starting...");
   console.log("mode=" + socket.handshake.auth['mode'] + 
               ", currentName=" + socket.handshake.auth['currentName'] + 
               ", nickName=" + socket.handshake.auth['nickName'] + 
               ", teamName=" + socket.handshake.auth['teamName']);
   
   cD.connectionIndex += 1;
   
   // Normal initial connection
   // Note that the host is always in normal mode.
   if (socket.handshake.auth['mode'] == 'normal') {
      // Increment until find a name that's not in use.
      do {
         cD.nameIndex += 1;
         var user_name = 'u' + cD.nameIndex;
      } while (nameInUse(user_name, cD.userName));
      
   } else if (socket.handshake.auth['mode'] == 're-connect') {
      // If re-connecting, re-use the current user name that comes in via the auth object.
      // Re-connection happens only when the client is starting a stream or when the P2P connection makes a second attempt.
      var user_name = socket.handshake.auth['currentName'];
   }
   var nick_name = setDefault(socket.handshake.auth['nickName'], null);
    // Differentiate nicknames in use by multiple clients by appending the user number (slice off the u).
   if (nick_name && nameInUse(nick_name, cD.nickName)) nick_name += user_name.slice(1);
   var team_name = setDefault(socket.handshake.auth['teamName'], null);
   
   // Two maps
   cD.userName[socket.id] = user_name;
   cD.nickName[socket.id] = nick_name;
   cD.teamName[socket.id] = team_name;
   cD.id[user_name] = socket.id;
   
   console.log('');
   console.log(connectionInfo());
   
   console.log('New client: ' + cD.userName[socket.id] + ', ' + socket.id + '.');
   
   // Tell the new user their network name. Note there is no listener for this on the host.
   if (socket.id != cD.hostID[cD.room[socket.id]]) {
      io.to(socket.id).emit('your name is', {'name':cD.userName[socket.id]});
   }
   
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
         io.to(cD.hostID[cD.room[socket.id]]).emit('echo-from-Server-to-Host', socket.id);
      }
      
   });
   socket.on('echo-from-Host-to-Server', function(msg) {
      var socket_id = msg;
      // Now that this has come back from the HOST, complete the trip and send this to the originating client.
      io.to(socket_id).emit('echo-from-Server-to-Client', 'host');
   });
   
   /*
   This timer protects my Heroku account from idle clients: an abandoned browser tab that has a socket open.
   The timer starts when the socket is opened, resets in "chat message". The host will not close until
   all the non-host clients have closed; the host's timer is recursively extended until it is the only
   client left.
   */
   var logoffTimer;
   var warningTimer;
   var idleTime_m = 0;
   function setTimer(reset, t_min=40.0) { // note 40 is in a message string below
      if (reset == "initialize") {
         idleTime_m = t_min;
      } else if (reset == "restart") { 
         clearTimeout(warningTimer);
         clearTimeout(logoffTimer);
         idleTime_m = t_min;
      } else if (reset == "extend") {
         clearTimeout(warningTimer);
         clearTimeout(logoffTimer);
      }
      
      if (reset != "extend") {
         warningTimer = setTimeout(() => {
            let warningMessage = 'Idle socket will disconnect in ' + (t_min/2.0).toFixed(1) + ' minutes.' +
                                 '</br></br>Click <strong>Chat</strong> to reset the disconnect timer to ' + t_min.toFixed(1) + ' minutes.';
            socket.emit('chat message', warningMessage);
         }, (t_min/2.0) * 60 * 1000);
      }

      logoffTimer = setTimeout(() => {
         let disconnectNotice = 'Idle for ' + idleTime_m.toFixed(1) + ' minutes. Network socket disconnected.';
         let advice = '</br></br>Click <strong>Chat</strong> before disconnection for 40 minutes of network time.' +
                      '</br></br>To <strong>reconnect:</strong> hosts click <strong>Create</strong>, clients click <strong>Connect</strong>.'
         let idString = ' (id=' + socket.id + ')';
         
         // Host
         if (socket.id == cD.hostID[cD.room[socket.id]]) {
            // don't disconnect the host if there are any non-host users
            let n_users = Object.keys(cD.userName).length;
            // don't let the extensions go on forever
            if ((n_users == 1) || (idleTime_m >= 180.0)) {
               socket.emit('chat message', disconnectNotice + advice);
               console.log(disconnectNotice + idString);
               removeUserFromMaps(socket.id);
               socket.disconnect();
            } else {
               let extraTime_m = 5.0;
               idleTime_m += extraTime_m;
               console.log("Time for host socket extended (" + (n_users-1) + "," + idleTime_m.toFixed(2) + ")");
               setTimer("extend", extraTime_m);
            }
         // non-Host client
         } else {
            socket.emit('chat message', disconnectNotice);
            console.log(disconnectNotice + idString);
            let pars = {'name':cD.userName[socket.id], 'originator':'server'};
            io.to(socket.id).emit('disconnectByServer', pars);
         }
         
      }, t_min * 60 * 1000);
   }
   setTimer("initialize");

   // Broadcast the incoming chat message to everyone in the sender's room. Allow some special text strings
   // to trigger actions on the server.
   socket.on('chat message', function(msg) {
      setTimer("restart");
      if (msg == "dcir") {
         if (socket.id == cD.hostID[cD.room[socket.id]]) {
            disconnectClientsInOneRoom(cD.room[socket.id]);
         } else {
            io.to(socket.id).emit('chat message', 'Requests to disconnect clients must come from the host.');
         }
         
      } else if (msg == "dac") {
         //disconnectClientsInAllRooms();
         
      } else if (msg == "rr") {
         if (socket.id == cD.hostID[cD.room[socket.id]]) {
            io.to(cD.hostID[cD.room[socket.id]]).emit('chat message', roomReport());
         } else {
            io.to(socket.id).emit('chat message', 'Requests for room reports must come from the host.');
         }
               
      } else {
         // General emit to the room. Note: io.to and io.in do the same thing.
         io.to(cD.room[socket.id]).emit('chat message', msg + " (" + setDisplayName(socket.id, 'comma') + ")");
      }
   });
   
   // Broadcast the incoming chat message to everyone in the sender's room, except the sender.
   socket.on('chat message but not me', function(msg) {
      // Emit to everyone in the sender's room except the sender.
      socket.to(cD.room[socket.id]).emit('chat message', msg + " (" + setDisplayName(socket.id, 'comma') + ")");
   });
   
   
   // Signaling in support of WebRTC.
   socket.on('signaling message', function(msg) {      
      if (msg.to == 'host') {
         var target = cD.hostID[cD.room[socket.id]];
      } else {
         var target = cD.id[msg.to];
      }
      
      // Relay the message (emit) to the target user.
      io.to(target).emit('signaling message', msg);
   });
   
   // General control message (note: same structure as the above handler for signaling messages)
   socket.on('control message', function(msg) {      
      // If a targeted chat message, add string that identifies the sender.
      if (msg.data.displayThis) {
         msg.data.displayThis += " (" + setDisplayName(socket.id, 'comma') + ")";
      }
      
      // to the host only
      if (msg.to == 'host') {
         var target = cD.hostID[cD.room[socket.id]];
      // to everyone in the room   
      } else if (msg.to == 'room') {
         var target = cD.room[socket.id];
      // to everyone in the room except the sender   
      } else if (msg.to == 'roomNoSender') {
         var target = cD.room[socket.id];
         socket.to(target).emit('control message', msg);
         return;
      // to this particular user
      } else {
         // Check whether specified as nick name.
         let nickName_id = null;
         for (let socket_id in cD.userName) {
            if (cD.nickName[socket_id] && (cD.nickName[socket_id] == msg.to)) nickName_id = socket_id;
         }
         var target = (nickName_id) ? nickName_id : cD.id[msg.to];
      }
      
      // Relay the message (emit) to the target user(s).
      io.to(target).emit('control message', msg);
   });
   
   socket.on('name report', function(names) {
      // Generate report then send it back to the user.
      io.to(socket.id).emit('name report', nameReport(names, socket.id));
   });
   
   // Send mouse and keyboard states to the host.
   socket.on('client-mK-event', function(msg) {
      // Determine the id of the room-host for this client. Then send data to the host for that room.
      // socket.id --> room --> room host.
      var hostID = cD.hostID[cD.room[socket.id]];
      
      // StH: Server to Host
      io.to(hostID).emit('client-mK-StH-event', msg);
   });
   
   // After connecting, the 'connect' listener, on client or host, sends a message to 'roomJoin' listener on the server.
   socket.on('roomJoin', function(msg) {
      var roomName = setDefault(msg.roomName, null);
      var requestStream = setDefault(msg.requestStream, false);
      var player = setDefault(msg.player, null);
      var hostOrClient = setDefault(msg.hostOrClient, 'client');
      
      var nickName = cD.nickName[socket.id];
      var teamName = cD.teamName[socket.id];
      var displayName = setDisplayName(socket.id, 'prens');
      
      if (hostOrClient == 'client') {
         // Check to make sure the room has a host.
         if (cD.hostID[roomName]) {
            socket.join(roomName);
            cD.room[socket.id] = roomName;
            console.log('Room ' + roomName + ' joined by ' + cD.userName[socket.id] + '.');
            
            // Send message to the individual client that is joining the room.
            io.to(socket.id).emit('room-joining-message', {'message':'You have joined room ' + cD.room[socket.id] + ' and your client name is '+ displayName +'.', 
                                                           'userName':cD.userName[socket.id]});
            
            // Message to the room host.
            // Give the host the name of the new network user so it can create a new game client. 
            // This is where "player", "nickName", and "teamName" info gets sent to the host.
            // Notice this emit to new-game-client is not done in the host block below.
            // Generally, the host sets its own identity directly, then listens (room-joining-message) 
            // to the server for any incrementation of its intended nickname.
            io.to(cD.hostID[roomName]).emit('new-game-client', 
               {'clientName':cD.userName[socket.id], 'requestStream':requestStream, 'player':player, 'nickName':nickName, 'teamName':teamName});
            
            // Chat message to the host.
            io.to(cD.hostID[roomName]).emit('chat message', displayName + ' is a new client in room ' + roomName + '.');
            
         } else {
            io.to(socket.id).emit('room-joining-message', {'message':'Sorry, there is no host yet for room ' + roomName + '.',
                                                           'userName':cD.userName[socket.id]});
         }
      
      } else if (hostOrClient == 'host') {
         // Should check if the room already has a host.
         if (cD.hostID[roomName]) {
            // Send warning to the client that is attempting to host.
            io.to(socket.id).emit('room-joining-message', {'message':'Sorry, there is already a host for room ' + roomName + '.',
                                                           'userName':cD.userName[socket.id]});
            
         } else {
            socket.join(roomName);
            cD.room[socket.id] = roomName;
            console.log('Room ' + roomName + ' joined by ' + cD.userName[socket.id] + '.');
            
            // General you-have-joined-the-room message. This is where the host gets its incremented nickname.
            io.to(socket.id).emit('room-joining-message', {'message':'You have joined room ' + cD.room[socket.id] + ' and your client name is ' + displayName + '.',
                                                           'userName':cD.userName[socket.id], 'nickName':nickName});
            
            // Set this user as the host for this room.
            cD.hostID[cD.room[socket.id]] = socket.id;
            console.log('User '+ displayName +' identified as host for room '+ cD.room[socket.id] + '.');
            
            // And oh-by-the-way "you are the host" message.
            io.to(socket.id).emit('room-joining-message', {'message':'You are the host of room ' + cD.room[socket.id] + '.',
                                                           'userName':cD.userName[socket.id]});
         }
      }
   });
   
   // This "disconnect" event is fired by the server when a socket is disconnected. 
   // (can be triggered by socket.disconnect() in this file or hostAndClient.js, or when a client reloads their page).
   socket.on('disconnect', function() {
      if (cD.userName[socket.id]) {
         
         var displayName = setDisplayName(socket.id, 'prens');
         
         // Report at the server.
         console.log(' ');
         var message = displayName + ' has disconnected.';
         console.log(message + ' (by self, ' + socket.id + ').');
         
         // Report to the room host.
         var hostID = cD.hostID[cD.room[socket.id]];
         io.to(hostID).emit('chat message', message + '.');
         io.to(hostID).emit('client-disconnected', cD.userName[socket.id]);
         
         // Remove this user from the maps.
         removeUserFromMaps(socket.id);
      }
   });
   
   socket.on('clientDisconnectByHost', function(msg) {
      let clientName = msg;
      let clientID = cD.id[clientName];
      
      // Send disconnect message to the client.
      io.to(clientID).emit('disconnectByServer', {'name':clientName, 'originator':'host'});
      
      // Don't do the following. It will disconnect the host socket. Not what we want here!
      //socket.disconnect();
   });
   
   socket.on('okDisconnectMe', function(msg) {
      // This event indicates that the non-host client has gotten the clientDisconnectByHost message (see above) and
      // agrees to go peacefully.
      var clientName = msg;
      var clientID = cD.id[clientName];
      
      // Report this at the server.
      console.log(' ');
      var message = clientName + ' has disconnected';
      console.log(message + ' (by host, '+clientID+').');
      
      // Report to the room host.
      var hostID = cD.hostID[cD.room[clientID]];
      io.to(hostID).emit('chat message', message);
      io.to(hostID).emit('client-disconnected', clientName);
      
      // Remove this user from the maps.
      removeUserFromMaps(socket.id);
      
      //Finally, go ahead and disconnect this client's socket.
      socket.disconnect();
   });

   socket.on('shutDown-p2p-deleteClient', function(msg) {
      var clientName = msg;
      var clientID = cD.id[clientName];
      var hostID = cD.hostID[cD.room[clientID]];
      io.to(hostID).emit('shutDown-p2p-deleteClient', clientName);   
   });
   
   socket.on('command-from-host-to-all-clients', function(msg) {
      // General emit to the room.
      io.to(cD.room[socket.id]).emit('command-from-host-to-all-clients', msg);
   });
   
});

// Start the server on the appropriate port
server.listen(PORT, '0.0.0.0', function() {
   console.log(`Server listening on *:${PORT}`);
   if (!isProduction) {
      console.log(`Access at https://localhost:${PORT}`);
      console.log('IMPORTANT: Since this uses a self-signed certificate, you will need to accept the security warning in your browser.');
   }
});
