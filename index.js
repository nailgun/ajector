module.exports = require('./lib/injector');

/*
Injector.prototype.resolve = function (factories, locals, cb) {
  if (typeof(locals) == 'function') {
    cb = locals;
    locals = undefined;
  }

  var child = new Injector(this);
  // TODO:
  //child.instance(); // <---- locals
  //child.factory();  // <---- locals

  for (var serviceName in factories) {
    if (!factories.hasOwnProperty(serviceName)) continue;
    child.factory(serviceName, factories[serviceName]);
  }

  var serviceNames = factories.keys();
  child.inject([serviceNames, function () {
    cb(_.zip(serviceNames, arguments));
  }, locals);
};
*/
