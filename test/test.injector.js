'use strict';

var Ajector = require('../index'),
    should = require('should'),
    async = require('async');

describe('Ajector([serviceDirs])', function () {
  describe('.instance(name, obj)', function () {
    it('should register `obj` for injection under name `name`', function (done) {
      var app = new Ajector();
      var s1 = {name: 'service1'};
      var s2 = function (arg) {};

      app.instance('service1', s1);
      app.instance('service2', s2);
      app.inject(function (service1, service2) {
        service1.should.equal(s1);
        service2.should.equal(s2);
        done();
      });
    });
  });

  describe('.factory(name, factory)', function () {
    it('should register `factory` as constructor for injection `name`', function (done) {
      var app = new Ajector();
      var s1 = {name: 'service1'};
      app.factory('service1', function () {
        return s1;
      });
      app.inject(function (service1) {
        service1.should.equal(s1);
        done();
      });
    });

    it('should use `new` on `factory`', function (done) {
      var app = new Ajector();

      var Ctor = function () {
        this.name = 'hello';
      };
      Ctor.prototype.age = 24;

      app.factory('service1', Ctor);

      app.inject(function (service1) {
        service1.name.should.equal('hello');
        service1.age.should.equal(24);
        done();
      });
    });
  });

  describe('.inject(fn, [locals], [callback])', function () {
    it('should resolve injections by argument names', function (done) {
      var app = new Ajector();
      app.instance('service1', {name: 'service1'});
      app.instance('service2', {name: 'service2'});

      app.inject(function (service1, service2) {
        service1.name.should.equal('service1');
        service2.name.should.equal('service2');

        app.inject(function (service2, service1) {
          service1.name.should.equal('service1');
          service2.name.should.equal('service2');
          done();
        });
      });
    });

    it('should load factories from dirs specified in constructor argument', function (done) {
      var app = new Ajector(__dirname + '/fixtures/services1', __dirname + '/fixtures/services2');

      app.inject(function (exampleService, service2) {
        exampleService.name.should.equal('hello');
        service2.name.should.equal('hello2');
        done();
      });
    });

    it('should call callback with return value of fn', function (done) {
      var app = new Ajector();
      app.instance('service1', {name: 'service1'});
      app.inject(function (service1) {
        return {
          name: 'hello'
        };
      }, function (ret) {
        ret.should.eql({
          name: 'hello'
        });
        done();
      });
    });

    it('should resolve instances in `locals`', function (done) {
      var app = new Ajector();

      var a = [1, 2, 3];

      var fn = function (args) {
        args.should.equal(a);
        done();
      };

      app.inject(fn, {
        args: a
      });
    });

    it('should not pass `locals` further then calling function', function (done) {
      var app = new Ajector();

      var s1 = { name: 'service1' };
      app.factory('service1', function (service2) {
        service2.should.equal(s2);
        return s1;
      });

      var s2 = { name: 'service2' };
      app.instance('service2', s2);

      var fn = function (service1, service2, inject) {
        service2.should.equal('mock');

        inject(function (service2) {
          service2.should.equal(s2);
          done();
        });
      };

      app.inject(fn, {
        service2: 'mock'
      });
    });

    it('should not modify injector with `locals`', function (done) {
      var app = new Ajector();

      var s1 = { name: 'service1' };
      app.instance('service1', s1);

      var fn = function (service1) {
        service1.should.equal('mock');
        app.inject(function (service1) {
          service1.should.equal(s1);
          done();
        });
      };

      app.inject(fn, {
        service1: 'mock'
      });
    });
  });

  describe('.inject(factories, [locals], [callback])', function () {
    it('should resolve dependencies between factories', function (done) {
      var app = new Ajector();

      var s1 = { name: 'service1' };
      var s2 = { name: 'service2' };

      app.inject({
        service1: function (service2) {
          service2.should.equal(s2);
          return s1;
        },
        service2: function () {
          return s2;
        }
      }, function () {
        done();
      });
    });

    it('should pass services map to callback', function (done) {
      var app = new Ajector();

      var s1 = { name: 'service1' };
      var s2 = { name: 'service2' };

      app.inject({
        service1: function (service2) {
          service2.should.equal(s2);
          return s1;
        },
        service2: function () {
          return s2;
        }
      }, function (map) {
        map.service1.should.equal(s1);
        map.service2.should.equal(s2);
        done();
      });
    });

    it('should not pass factories further then factories', function (done) {
      var app = new Ajector();

      var originalAppService2 = { name: 'appService2' };
      app.instance('appService2', originalAppService2);

      var originalAppService = { name: 'appService' };
      app.factory('appService', function (appService2) {
        appService2.should.equal(originalAppService2);
        return originalAppService;
      });

      var s2 = { name: 's2' };

      app.inject({
        service: function (appService, appService2) {
          appService.should.equal(appService);
          appService2.should.equal(s2);
        },
        appService2: function () {
          return s2;
        }
      }, function () {
        done();
      });
    });
  });

  describe('when calling factory', function () {
    it('should inject dependencies to factory function', function (done) {
      var app = new Ajector();
      app.factory('service1', function (service2) {
        service2.name.should.equal('service2');
        done();
        return {name: 'service1'};
      });
      app.instance('service2', {name: 'service2'});

      app.inject(function (service1) {});
    });

    it('should interpret special constructor callback argument', function (done) {
      var app = new Ajector();
      app.factory('service1', function (service2, callback) {
        service2.name.should.equal('service2');
        callback.should.be.a('function');
        done();
        return {name: 'service1'};
      });
      app.instance('service2', {name: 'service2'});

      app.inject(function (service1) {});
    });

    it('should wait until factory callback is called', function (done) {
      var app = new Ajector();
      var initialized = false;

      app.factory('service1', function (callback) {
        setTimeout(function () {
          initialized = true;
          callback();
        }, 20);
        return {};
      });

      app.inject(function (service1) {
        initialized.should.be.true;
        done();
      });
    });

    it('should throw if callback is called with error', function () {
      var app = new Ajector();
      app.factory('service1', function (callback) {
        callback(new Error('error'));
        return {};
      });

      (function () {
        app.inject(function (service1) {});
      }).should.throw();
    });
  });

  it('should drop surrounding _underscores_ from injection name', function (done) {
    var app = new Ajector();
    app.instance('service1', {name: 'service1'});
    app.instance('service2', {name: 'service2'});

    app.inject(function (_service1_, _service2_) {
      _service1_.name.should.equal('service1');
      _service2_.name.should.equal('service2');
      done();
    });
  });

  it('should create only one instance of injection [1]', function (done) {
    var app = new Ajector();
    var initialized = false;
    var initialized2 = false;

    app.factory('service1', function (service2) {
      initialized.should.be.false;
      initialized = true;
      return {};
    });

    app.factory('service2', function (callback) {
      initialized2.should.be.false;
      initialized2 = true;
      setTimeout(function () {
        callback();
      }, 10);
      return {};
    });

    app.inject(function (service1, service2) {
      app.inject(function (service1, service2) {
        done();
      });
    });
  });

  it('should create only one instance of injection [2]', function (done) {
    var app = new Ajector();
    var initialized = false;

    app.factory('service1', function (callback) {
      initialized.should.be.false;
      initialized = true;
      setTimeout(function () {
        callback();
      }, 10);
      return {};
    });

    async.parallel([function (cb) {
      app.inject(function (service1) {
        cb();
      });
    }, function (cb) {
      app.inject(function (service1) {
        cb();
      });
    }], done);
  });

  it('should create only one instance of injection [3]', function (done) {
    var app = new Ajector();
    var initialized = false;
    var validOrder = false;

    app.factory('service1', function (callback) {
      initialized.should.be.false;
      initialized = true;
      setTimeout(function () {
        callback();
      }, 10);
      return {};
    });


    async.parallel([function (cb) {
      app.inject(function (service1) {
        validOrder.should.be.true;
        cb();
      });
    }, function (cb) {
      app.inject(function (inject) {
        validOrder = true;
        inject(function (service1) {
          cb();
        }, {
          i: 123
        });
      });
    }], done);
  });

  it('should provide `inject` injection', function (done) {
    var app = new Ajector();
    app.factory('service1', function (inject) {
      inject(function (service2) {
        service2.name.should.equal('service2');
        done();
      });
      return {};
    });
    app.instance('service2', {name: 'service2'});

    app.inject(function (service1) {});
  });
});
