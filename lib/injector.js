'use strict';

var async = require('async'),
    path = require('path'),
    _ = require('underscore'),
    callstack = require('callstack');

var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m,
    FN_ARG_SPLIT = /,/,
    FN_ARG = /^\s*(_?)(\S+?)\1\s*$/,
    STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

var injector = module.exports = function (arg) {
  var self = this;
  if(!(self instanceof injector)) return new injector(Array.prototype.slice.call(arguments));

  // TODO: remove this hack after getting rid of previous badline
  if (_.isArray(arg)) {
    if (arg[0] instanceof injector) {
      arg = arg[0];
    }
  }

  if (arg instanceof injector) {
    self._root = arg._root;
    self._inherited = {
      instances: _.extend({}, arg._inherited.instances),
      factories: _.extend({}, arg._inherited.factories)
    };
  }
  else {
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

    self._inherited = {
      instances: {},
      factories: {}
    };
  }

  var inject = self.inject.bind(self);
  self._inherited.instances.inject = inject;

  // TODO: remove maybe?
  inject.__defineGetter__('instances', function () {
    return _.extend({}, self._root.instances, self._inherited.instances);
  });
};

injector.prototype.inject = function (fn, locals, cb) {
  var self = this;

  if (typeof(locals) === 'function') {
    cb = locals;
    locals = undefined;
  }

  var stack = callstack();

  var i;
  if (!locals) {
    i = self;
  } else {
    i = new injector(self);
    _.extend(i._inherited.instances, locals);
  }

  i._inject(fn, function (err, ret) {
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

injector.prototype.instance = function (name, obj) {
  this._inherited.instances[name] = obj;
};

injector.prototype.factory = function (name, factory) {
  this._inherited.factories[name] = factory;
};

injector.prototype._inject = function (fn, cb) {
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
      instance = self._inherited.instances[name];
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

injector.prototype._resolve = function (name, cb) {
  var self = this;

  var factory;
  if (factory = self._root.factories[name]) {
    delete self._root.factories[name];
  } else if (factory = self._inherited.factories[name]) {
    delete self._inherited.factories[name];
    // TODO: should place resolved in self._inherited (not _root)
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

  self._inject(factory, function (err, instance) {
    cb(err, name, instance); // actually calls ._resolved()
  });
};

injector.prototype._resolved = function (err, name, instance) {
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
