# ajector
*Asynchronous dependency injector.*

[![Build Status](https://travis-ci.org/nailgun/ajector.png?branch=master)](https://travis-ci.org/nailgun/ajector)

```npm install ajector```

## Usage

1. Write modules
   ```js
   // services/Service1.js
   module.exports = function () {
     return {};
   };
   ```

2. Setup injector

   ```js
   var ajector = require('ajector');
   
   var injector = ajector(__dirname + '/services');
   injector.instance('config', config);
   injector.instance('db', db);
   ```

3. Use injector

   ```js
   injector.inject(function (Service1, db, config) {
     // this function will be called asynchronously after all required modules are initialized
   });
   ```

For more details take a look at provided [testsuite](test/test.injector.js).
There are all possible use cases.
