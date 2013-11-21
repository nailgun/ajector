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
  var self = this;
  // TODO: remove next line

  var factoriesDirs;
  if (_.isArray(arg)) {
    factoriesDirs = arg;
  } else {
    factoriesDirs = arguments;
  }

  self._root = {
    instances: {},
    factories: {},
    callbacks: {},
    factoriesDirs: factoriesDirs
  };

  var inject = self.inject.bind(self);
  self._root.instances.inject = self.inject.bind(self);
};

Ajector.prototype.inject = function (fn, locals, cb) {
  if (typeof(locals) === 'function') {
    cb = locals;
    locals = undefined;
  }
  locals = locals || {};

  var stack = callstack();
  this._inject(fn, locals, function (err, ret) {
    if (!err) return cb && cb(ret);

    stack = stack.splice(1);
    var txtStack = stack.join('\n');

    var err2 = new Error('Error during injection\n' + txtStack +
      '\n\nOriginal error was '+err);
    err2.cause = err;
    err2.injectStack = stack;
    throw err2;
  });
};

Ajector.prototype.instance = function (name, obj) {
  this._root.instances[name] = obj;
};

Ajector.prototype.factory = function (name, factory) {
  this._root.factories[name] = factory;
};

Ajector.prototype._inject = function (fn, locals, cb) {
  var self = this;

  var names = [];
  var fnText = fn.toString().replace(STRIP_COMMENTS, '');
  var argDecl = fnText.match(FN_ARGS);
  argDecl[1].split(FN_ARG_SPLIT).forEach(function (arg) {
    arg.replace(FN_ARG, function (all, underscore, name) {
      names.push(name);
    });
  });

  var ret;
  var done = function (err) {
    cb && cb(err, ret);
  }

  async.map(names, function (name, cb) {
    var instance;
    if (name === 'callback') {
      instance = done;
      done = null;
    } else {
      instance = locals[name];
      if (!instance) {
        instance = self._root.instances[name];
      }
    }
    if (instance) {
      return cb(null, instance);
    }

    var callbacks = self._root.callbacks[name];
    if (!callbacks) {
      callbacks = self._root.callbacks[name] = [];
      callbacks.push(cb);
      self._resolve(name, self._resolved.bind(self));
    } else {
      callbacks.push(cb);
    }

  }, function (err, instances) {
    if (err) return cb && cb(err);
    ret = construct(fn, instances);
    done && done();
  });
};

Ajector.prototype._resolve = function (name, cb) {
  var self = this;

  var factory;
  if (factory = self._root.factories[name]) {
    delete self._root.factories[name];
  } else {
    var factoriesDirs = self._root.factoriesDirs;
    for (var i = 0; i < factoriesDirs.length; i++) {
      var factoryDir = factoriesDirs[i];
      try {
        factory = require(path.join(factoryDir, name));
        break;
      } catch (err) {
      }
    }

    if (!factory) {
      return cb(new Error("can't find factory for " + name), name);
    }
  }

  self._inject(factory, {}, function (err, instance) {
    cb(err, name, instance); // actually calls ._resolved()
  });
};

Ajector.prototype._resolved = function (err, name, instance) {
  var self = this;

  self._root.instances[name] = instance;
  var callbacks = self._root.callbacks[name];
  callbacks.forEach(function (cb) {
    cb(err, instance);
  });
  delete self._root.callbacks[name];
};

function construct (constructor, args) {
  function Ctor () {
    return constructor.apply(this, args);
  }
  Ctor.prototype = constructor.prototype;
  return new Ctor();
}
