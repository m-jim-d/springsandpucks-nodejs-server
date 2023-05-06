const app = require('express')();
const http = require('http').Server(app);

let options = { cors: {origin: "*"} };
const io = require('socket.io')(http, options);

const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
   res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
   console.log('new connection in chat-demo, server.js, ' + socket.id);
   
   // timer to disconnect an idle client
   var logoffTimer;
   function setTimer( reset) {
      if (reset) clearTimeout( logoffTimer);
      logoffTimer = setTimeout( () => {
         let disconnectNotice = 'Idle for 15min. Socket disconnected.';
         let idString = ' (id=' + socket.id + ')';
         socket.emit('chat message', disconnectNotice);
         console.log( disconnectNotice + idString);
         socket.disconnect();
      }, 15 * 60 * 1000);
   }
   setTimer(false);
   
   socket.on('chat message', msg => {
      setTimer(true);
      
      io.emit('chat message', msg);
   });
});

http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});
