'use strict';

var async = require('async'),
    path = require('path'),
    _ = require('underscore'),
    callstack = require('callstack');

var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m,
    FN_ARG_SPLIT = /,/,
    FN_ARG = /^\s*(_?)(\S+?)\1\s*$/,
    STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

var Ajector = module.exports = function (arg) {
  this.instances = this._instances = {
    inject: this.inject.bind(this)
  };

  if (_.isArray(arg)) {
    this._factoriesDirs = arg;
  } else {
    this._factoriesDirs = arguments;
  }

  this._factories = {};
  this._callbacks = {};
};

Ajector.prototype.inject = function (arg, locals, cb) {
  var fn, localFactories, names;

  if (typeof(arg) === 'function') {
    localFactories = {};
    fn = arg;
  } else {
    localFactories = arg;
    names = Object.keys(localFactories);
    fn = function () {
      return _.object(names, arguments);
    };
  }

  if (typeof(locals) === 'function') {
    cb = locals;
    locals = undefined;
  }
  locals = locals || {};

  var stack = callstack();
  this._inject(fn, names, locals, localFactories, {}, function (err, ret) {
    if (!err) return cb && cb(ret);

    stack = stack.splice(1);
    var txtStack = stack.join('\n');

    var err2 = new Error('Error during injection\n' + txtStack + '\n\n' +
                         'Original error was '+err);
    err2.cause = err;
    err2.injectStack = stack;
    throw err2;
  });
};

Ajector.prototype.instance = function (name, obj) {
  this._instances[name] = obj;
};

Ajector.prototype.factory = function (name, factory) {
  this._factories[name] = factory;
};

Ajector.prototype._inject = function (fn, names, locals, localFactories, localCallbacks, cb) {
  var self = this;

  if (!names) {
    names = [];

    var fnText = fn.toString().replace(STRIP_COMMENTS, '');
    var argDecl = fnText.match(FN_ARGS);
    argDecl[1].split(FN_ARG_SPLIT).forEach(function (arg) {
      arg.replace(FN_ARG, function (all, underscore, name) {
        names.push(name);
      });
    });
  }

  var ret;
  var done = function (err) {
    cb && cb(err, ret);
  }

  async.map(names, function (name, cb) {
    if (name === 'callback') {
      var done2 = done;
      done = null;
      cb(null, done2);
    } else {
      self._resolve(name, locals, localFactories, localCallbacks, cb);
    }

  }, function (err, instances) {
    if (err) return cb && cb(err);
    ret = fn.apply(null, instances);
    done && done();
  });
};

Ajector.prototype._resolve = function (name, locals, localFactories, localCallbacks, cb) {
  var self = this;

  if (locals[name]) {
    return cb(null, locals[name]);
  }

  if (self._instances[name] && !localFactories[name]) {
    return cb(null, self._instances[name]);
  }

  var factories, instances, callbacks,
      next = {};

  var factory = localFactories[name];
  if (factory) {
    instances = locals;
    factories = localFactories;
    callbacks = localCallbacks;

    next.locals = locals;
    next.localFactories = localFactories;
    next.localCallbacks = localCallbacks;
  } else {
    factory = self._factories[name];
    instances = self._instances;
    factories = self._factories;
    callbacks = self._callbacks;

    next.locals = {};
    next.localFactories = {};
    next.localCallbacks = {};
  }

  if (callbacks[name]) {
    callbacks[name].push(cb);
  } else {
    callbacks[name] = [cb];

    if (!factory) {
      var factoriesDirs = self._factoriesDirs;
      for (var i = 0; i < factoriesDirs.length; i++) {
        var factoryDir = factoriesDirs[i];
        try {
          factory = require(path.join(factoryDir, name));
          break;
        } catch (err) {
          // TODO: if not found - skip, if other error - throw
        }
      }

      if (!factory) {
        return cb(new Error("can't find factory for " + name), name);
      }
    }

    self._inject(factory, null, next.locals, next.localFactories, next.localCallbacks, function (err, instance) {
      instances[name] = instance;
      callbacks[name].forEach(function (cb) {
        cb(err, instance);
      });
      delete callbacks[name];
      delete factories[name];
    });
  }
};
