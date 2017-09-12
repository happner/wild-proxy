<span style="font-size:128">->&#191;=></span> wild-proxy
----------------

#### *rules based http/s proxy utilising wild-pare and nodejitsu's http-proxy*

#### still in development, so there be dragons..

#### quickstart

```bash

npm i wild-proxy --save

```

#### as per the tests:

```javascript

var steps = {};

var http = require('http');

//start up some servers

var server1 = http.createServer(function(req, res) {

  var message = 'echo: ' + req.url + ', steps: ' + steps[req.url].join(',');
  //console.log(message);
  res.end(message);
});

var server2 = http.createServer(function(req, res) {

  var message = 'echo: ' + req.url + ', steps: ' + steps[req.url].join(',');
  //console.log(message);
  res.end(message);
});

server1.listen(55554);

server2.listen(44443);

//wait 2 seconds

setTimeout(function(){

  //define some handlers

  var __handleRequest1 = function (req, res, $happn, rule) {

    return new Promise(function(resolve){
      if (!steps[req.url]) steps[req.url] = [];
      steps[req.url].push(rule.name);
      return resolve();
    })
  };

  var __handleRequest2 = function (req, res, $happn, rule) {

    return new Promise(function(resolve){
      if (!steps[req.url]) steps[req.url] = [];
      steps[req.url].push(rule.name);
      return resolve();
    })
  };

  var __handleRequest21 = function (req, res, $happn, rule) {

    return new Promise(function(resolve){
      if (!steps[req.url]) steps[req.url] = [];
      steps[req.url].push(rule.name);
      return resolve();
    })
  };

  var __handleRequest22 = function (req, res, $happn, rule) {

    return new Promise(function(resolve){
      if (!steps[req.url]) steps[req.url] = [];
      steps[req.url].push(rule.name);
      return resolve();
    })
  };

  var __handleRequest23 = function (req, res, $happn, rule) {

    return new Promise(function(resolve){
      if (!steps[req.url]) steps[req.url] = [];
      steps[req.url].push(rule.name);
      return resolve();
    })
  };

  var __handleBadRequest = function (req, res, $happn, rule) {

    return new Promise(function(resolve){

      if (!steps[req.url]) steps[req.url] = [];

      steps[req.url].push(rule.name);

      return resolve();
    })
  };

  var listener1 = {
    name: 'listener-1',
    port: 55555,
    protocol: 'http',
    target: 'http://localhost:55554',
    rule: 'rules-1'
  };

  var listener2 = {
    name: 'listener-2',
    port: 44444,
    protocol: 'http',
    target: 'http://localhost:44443',
    rule: 'rules-2'
  };

  //set up the proxy config

  var wildProxyConfig = {

    listeners: [listener1, listener2],
    rules: [
      {
        name: 'rules-1',
        path: '*',
        handler: __handleRequest1.bind(__handleRequest1),
        terminate: true
      },
      {
        name: 'rules-2',
        steps: [
          {
            name: 'rules-20',
            path: '/auth?*',
            handler: __handleRequest2.bind(__handleRequest2),
            terminate: true//if this rule is activated, dont proceed to follow on rules
          },
          {
            name: 'rules-21',
            path: '*auth*',
            handler: __handleRequest21.bind(__handleRequest21)
          },
          {
            name: 'rules-22',
            path: '/dashboards?*',
            handler: __handleRequest22.bind(__handleRequest22),
            terminate: true
          },
          {
            name: 'rules-23',
            path: '/app/kibana*',
            handler: __handleRequest23.bind(__handleRequest23),
            terminate: true
          },
          {
            name: 'rules-bad',
            path: '*',
            handler: __handleBadRequest.bind(__handleBadRequest)
          }
        ]
      }
    ]
  };

  //instantiate our proxy
  var wildProxy = require('wild-proxy').create(wildProxyConfig);

  var randomString = testUtilities.string();

  //listen
  wildProxy.listen()

    .then(function(){

      return testUtilities.doRequest('http', '127.0.0.1', 55555, '/' + randomString, null);
    })

    .then(function(response){

      expect(response.body.toString()).to.be('echo: /' + randomString + ', steps: rules-1');

      return testUtilities.doRequest('http', '127.0.0.1', 44444, '/auth?' + randomString, null);
    })

    .then(function(response){

      expect(response.body.toString()).to.be('echo: /auth?' + randomString + ', steps: rules-20');

      return testUtilities.doRequest('http', '127.0.0.1', 44444, '/dashboards?' + randomString, null);
    })

    .then(function(response){

      expect(response.body.toString()).to.be('echo: /dashboards?' + randomString + ', steps: rules-22');

      return testUtilities.doRequest('http', '127.0.0.1', 44444, '/app/kibana/' + randomString, null);
    })

    .then(function(response){

      expect(response.body.toString()).to.be('echo: /app/kibana/' + randomString + ', steps: rules-23');

      return testUtilities.doRequest('http', '127.0.0.1', 44444, '/bad/' + randomString, null);
    })

    .then(function(response){

      expect(response.body.toString()).to.be('echo: /bad/' + randomString + ', steps: rules-bad');

      wildProxy.stop()

        .then(function(){

          server1.close();

          server2.close();

          setTimeout(done, 1000);

        }).catch(done);
    })

    .catch(done);

}, 2000);

```

#### supported node versions:

v0.10 - v8