'use strict';

var ajector = require('../index'),
    should = require('should'),
    async = require('async');

describe('ajector([serviceDirs])', function () {
  describe('.instance(name, obj)', function () {
    it('should register `obj` for injection under name `name`', function (done) {
      var app = ajector();
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

    it('should not modify parent injector', function (done) {
      var app = ajector();
      var s1 = {name: 'service1'};
      app.instance('service1', s1);

      var child = ajector(app);
      var s2 = {name: 'service1', field: true};
      child.instance('service1', s2);

      app.inject(function (service1) {
        service1.should.equal(s1);
        done();
      });
    });
  });

  describe('.factory(name, factory)', function () {
    it('should register `factory` as constructor for injection `name`', function (done) {
      var app = ajector();
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
      var app = ajector();

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

    it('should not modify parent injector', function (done) {
      var app = ajector();
      var s1 = {name: 'service1'};
      app.factory('service1', function () {
        return s1;
      });

      var child = ajector(app);
      var s2 = {name: 'service1', field: true};
      child.factory('service1', function () {
        return s2;
      });

      child.inject(function (service1) {
        service1.should.equal(s2);
        app.inject(function (service1) {
          service1.should.equal(s1);
          done();
        });
      });
    });
  });

  describe('.inject(fn, [locals], [callback])', function () {
    it('should resolve injections by argument names', function (done) {
      var app = ajector();
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
      var app = ajector(__dirname + '/fixtures/services1', __dirname + '/fixtures/services2');

      app.inject(function (exampleService, service2) {
        exampleService.name.should.equal('hello');
        service2.name.should.equal('hello2');
        done();
      });
    });

    it('should call callback with return value of fn', function (done) {
      var app = ajector();
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
      var app = ajector();

      var a = [1, 2, 3];

      var fn = function (args) {
        args.should.equal(a);
        done();
      };

      app.inject(fn, {
        args: a
      });
    });

    it('should not modify injector with `locals`', function (done) {
      var app = ajector();

      var s1 = {
        name: 'service1'
      };

      var fn = function (service1) {
        service1.should.equal('mock');
        app.inject(function (service1) {
          service1.should.equal(s1);
          done();
        });
      };

      app.instance('service1', s1);

      app.inject(fn, {
        service1: 'mock'
      });
    });

    it('should resolve dependencies from parent injector', function (done) {
      var app = ajector();

      var s1 = {
        name: 'service1'
      };

      app.instance('service1', s1);

      debugger;
      var child = ajector(app);
      child.inject(function (service1) {
        service1.should.equal(s1);
        done();
      });
    });

    describe('.instances', function () {
      it('should contain all instanciated objects', function () {
        var app = ajector();
        var s1 = {name: 'service1'};
        var s2 = {name: 'service2'};
        app.instance('service1', s1);
        app.instance('service2', s2);
        app.inject(function (inject, service1, service2) {
          var instances = inject.instances;
          instances.should.eql({
            service1: s1,
            service2: s2,
            inject: inject
          });
        });
      });
    });
  });

  describe('when calling factory', function () {
    it('should inject dependencies to factory function', function (done) {
      var app = ajector();
      app.factory('service1', function (service2) {
        service2.name.should.equal('service2');
        done();
        return {name: 'service1'};
      });
      app.instance('service2', {name: 'service2'});

      app.inject(function (service1) {});
    });

    it('should interpret special constructor callback argument', function (done) {
      var app = ajector();
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
      var app = ajector();
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
      var app = ajector();
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
    var app = ajector();
    app.instance('service1', {name: 'service1'});
    app.instance('service2', {name: 'service2'});

    app.inject(function (_service1_, _service2_) {
      _service1_.name.should.equal('service1');
      _service2_.name.should.equal('service2');
      done();
    });
  });

  it('should create only one instance of injection [1]', function (done) {
    var app = ajector();
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
    var app = ajector();
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
    var app = ajector();
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
    var app = ajector();
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

  describe('injection `inject`', function () {
    it('should inherit locals in original inject', function (done) {
      var app = ajector();

      var a = [1, 2, 3];
      var a2 = [4, 5, 6];

      var fn = function (inject) {
        inject(function (args, args2) {
          args.should.equal(args);
          args2.should.equal(args2);
          done();
        }, {
          args2: a2
        });
      };

      app.inject(fn, {
        args: a
      });
    });
  });
});
