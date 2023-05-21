let http = require('http');

http.createServer(function (req, res) {
  res.write("Starting...");
  res.write("I'm alive. Nice!");
  res.end();
}).listen(10000, '0.0.0.0');
