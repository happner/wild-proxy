var async = require('async')
  , Cache = require('redis-lru-cache')
  , PareTree = require('wild-pare')
  , EventEmitter = require('events').EventEmitter
  , utilities = require('./utilities').create()
  ;

function WildProxyListener(config, rules, $happn) {

  var _this = this;

  if (!config.name) throw new Error('listener missing name argument');

  if (!config.target) throw new Error('listener ' + config.name + ' missing target argument');

  if (!config.port) throw new Error('listener ' + config.name + ' missing port argument');

  if (!config.proxy) config.proxy = {};

  this.__events = new EventEmitter();

  _this.__config = config;

  _this.__handlers = {};

  _this.$happn = $happn;

  _this.__setupRuleStack(rules);

  _this.__setupCache();
}

/* create, listen and stop */

WildProxyListener.create = function (config, rules, $happn) {

  return new WildProxyListener(config, rules, $happn);
};

WildProxyListener.prototype.listen = listen;

WildProxyListener.prototype.stop = stop;

/* handle request and rules s*/

WildProxyListener.prototype.__setupRuleStack = __setupRuleStack;

WildProxyListener.prototype.__getRuleStack = __getRuleStack;

WildProxyListener.prototype.__applyRule = __applyRule;

WildProxyListener.prototype.__handleRequest = __handleRequest;

WildProxyListener.prototype.__errorResponse = __errorResponse;

/* cache set up */

WildProxyListener.prototype.__setupCache = __setupCache;

/* events */

WildProxyListener.prototype.emit = emit;

WildProxyListener.prototype.on = on;

WildProxyListener.prototype.off = off;

function emit(key, data, $happn) {

  var _this = this;

  if ($happn) {

    //[start:{"key":"emit", "self":"_this"}:start]

    $happn.emit(key, data, function (e) {

      //[end:{"key":"emit", "self":"_this"}:end]

      if (e) _this.__events.emit('emit-failure', [key, data]);
    });
  }

  _this.__events.emit(key, data);
}

function on(key, handler) {

  return this.__events.on(key, handler);
}

function off(key, handler) {

  return this.__events.removeListener(key, handler);
}

function listen () {

  var _this = this;

  return new Promise(function (resolve, reject) {

    try {

      var Server;
      var Proxy;

      if (_this.__config.protocol == 'https') {

        Server = require('https');
        Proxy = require('https-proxy');

      } else {

        Server = require('http');
        Proxy = require('http-proxy');
      }

      _this.__proxy = Proxy.createProxyServer(_this.__config.proxy);

      _this.__proxy.on('proxyReq', function(proxyReq, req, res, options) {


        if (req.body) { //re-stream the body, because we took it off the stream earlier

          proxyReq.setHeader('Content-Length', Buffer.byteLength(req.body));
          proxyReq.write(req.body);
        }
      });

      _this.__server = Server.createServer(function(req, res) {

        _this.__handleRequest(req, res, function(e, preventProxy){

          if (e) return _this.__errorResponse (res, e);

          if (preventProxy) return;

          _this.__proxy.web(req, res, { target: _this.__config.target });
        });
      });

      _this.__server.listen(_this.__config.port);

      resolve();

    } catch (e) {

      reject(e);
    }
  });
}

function stop () {

  var _this = this;

  return new Promise(function (resolve, reject) {

    try {

      if (_this.__server) _this.__server.close();

      if (_this.__proxy) _this.__proxy.close();

      return resolve();

    } catch (e) {
      console.warn('unable to stop wild-proxy-listener: ' + e.toString());
      reject(e);
    }
  });
}

function __setupRuleStack (rules) {

  var _this = this;

  if (_this.__config.ruleStack == null) _this.__config.ruleStack = {cache: 1000};

  _this.__config.ruleStack.mode = 'wildstring';

  _this.__ruleStack = new PareTree(_this.__config.ruleStack);

  var steps = [];

  if (!_this.__config.rule) {
    steps.push({path: '*', name: 'default-transparent'});
  }

  rules.forEach(function (rule) {

    //if a rule has not been set for the listener, we select a rule with a matching name
    if ( (_this.__config.rule != null && rule.name == _this.__config.rule)
      || (_this.__config.rule == null && rule.name == _this.__config.name)) {

      if (!rule.steps || rule.steps.length == 0) {

        if (!rule.path) rule.path = '*';

        steps.push(rule);
      }

      else rule.steps.forEach(function (ruleStep) {
        steps.push(ruleStep);
      });
    }
  });

  steps.forEach(function (step, stepIndex) {

    var stepReference = _this.__ruleStack.add(step.path, {key: step.name + stepIndex, data:{order: stepIndex}});

    _this.__handlers[stepReference.id] = step;
  });
}

function __getRuleStack (url) {

  var _this = this;

  var stackResponse = this.__ruleStack.search(url);

  return stackResponse.sort(function (a, b) {

    return a.data.order > b.data.order;

  }).map(function (stackItem) {

    return _this.__handlers[stackItem.id]
  })
}

function __applyRule (ruleEvent, ruleCB) {

  if (!ruleEvent.rule.handler) return ruleCB(null, !ruleEvent.terminate);

  try{

    ruleEvent.rule.handler.apply(ruleEvent.rule.handler, [ruleEvent.req, ruleEvent.res, ruleEvent.$happn, ruleEvent.rule])

      .then(function (handlerPreventProxy, forceTerminate) {

        //so some handler has decided to prevent or allow the proxying
        if (handlerPreventProxy === true || forceTerminate) return ruleCB(null, false, handlerPreventProxy);

        return ruleCB(null, !ruleEvent.rule.terminate);
      })
      .catch(function(e){

        ruleCB(e, false, true);
      });

  } catch(e){

    console.warn('failed to apply rule: ' + ruleEvent.rule.name + ', are you sure you have made the rule return a promise?');

    ruleCB(e, false, true);
  }
}

function __handleRequest (req, res, callback) {

  var _this = this;

  _this.emit('started-request', req.url);

  var rulesStack = _this.__getRuleStack(req.url);

  var currentRule;

  var preventProxy = false;

  async.everySeries(rulesStack, function (rule, ruleCB) {

      currentRule = {
        req: req,
        res: res,
        $happn: _this.$happn,
        rule: rule
      };

      _this.emit('rule-applying', {rule: currentRule.rule.name});

      _this.__applyRule(currentRule, function(e, proceedNextRule, rulePreventProxy){

        if (rulePreventProxy === true) preventProxy = true;

        ruleCB(e, proceedNextRule);
      });

    }, function (e) {

      if (e) {

        _this.emit('rule-error', {rule: currentRule.rule.name, error: e.toString()}, _this.$happn);

        return callback(e, true);
      }

      _this.emit('completed-request', req.url);

      callback(null, preventProxy);
    }
  )
}

function __setupCache (){

  var _this = this;

  if (_this.__config.cache) {

    if (_this.__config.cache === true) _this.__config.cache = {
      cacheId: 'wild-proxy:' + config.name,
      lru: {
        max: 1000
      }
    };

    _this.__stackCache = new Cache(_this.__config.cache);

    _this.__oldGetRuleStack = _this.__getRuleStack;

    //override the getstack to check and update the cache
    _this.__getRuleStack = function (url) {

      var cached = _this.__stackCache.get(url);

      if (cached) return cached;

      var toCache = _this.__oldGetRuleStack(url);

      if (!toCache) return null;

      _this.__stackCache.set(url, toCache);

      return toCache;
    }
  }
}

function __errorResponse (res, error){

  res.writeHead(500, {
    'Content-Type': 'application/json'
  });

  res.end(utilities.stringifyError(error));
}

module.exports = WildProxyListener;