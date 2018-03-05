/**
 * Implementation of some of Drupal's database layer in Node.js.
 *
 * Ie. stuff that lives in database.inc in Drupal.
 */
"use strict";

var activeDb,
    mysql = require('mysql'),
    pg = require('pg'),
    activeBackend,
    connectionOptions;

/**
 * db_connect() as in Drupal 6.
 *
 * This is much more complex with PDO in Drupal 7, which we won't try to
 * emulate here.
 * 
 * Example options struct:
 *  "database": {
 *   "host": "localhost",
 *   "port": 3306,
 *   "user": "drupal",
 *   "password": "drupal",
 *   "database": "drupal"
 *  }
 */
function connect(options) {
  // Default driver is MySQL.
  activeBackend = options.driver || 'mysql';

  // Save the connection options for later use.
  connectionOptions = options;

  if (activeBackend === 'mysql') {
    // Save a reference to the MySQL client object for later use.
    activeDb = mysql.createPool(options);

    if (activeDb !== null) {
      activeDb
        .on('acquire', function (connection) {
        console.log('Connection %d acquired', connection.threadId);
      })
        .on('enqueue', function () {
        console.log('Waiting for available connection slot');
      })
        .on('release', function (connection) {
        console.log('Connection %d released', connection.threadId);
      });
    }
  }

  return activeDb;
}

/**
 * Get the client object for the current database connection.
 */
function getClient(callback) {
  if (!connectionOptions) {
    callback('Connection options missing. Please call db.connect before any other database functions to configure the database configuration');
  }

  if (activeBackend === 'mysql') {
    if (activeDb) {
      return callback(null, activeDb);
    }
    else {
      connect(connectionOptions);
      return callback(null, activeDb);
    }
  }
  else if (activeBackend === 'pgsql') {
    return pg.connect(connectionOptions, callback);
  }
}

/**
 * db_query() as in Drupal (though callback-based).
 */
function query(queryString, args, callback) {
  getClient(function (err, client) {
    if (err) { callback(err); }

    if (!client) {
      callback('Could not connect to the database');
    }
    else {
      runQuery(client, queryString, args, callback);
    }
  });
}

/**
 * Do the actual work of running the query.
 */
function runQuery(client, queryString, args, callback) {
  if (activeBackend === 'mysql') {
    queryString = queryString.replace(/\$\d+/, '?');
  }

  client.query(queryString, args, function (err, result) {
    if (err) {
      callback(err, null);
      return;
    }
    if (activeBackend === 'mysql') {
      callback(err, result);
    }
    else if (activeBackend === 'pgsql') {
      var rows = [];
      if (result.rows) {
        rows = result.rows;
      }
      callback(err, rows);
    }
  });
}

module.exports = {
  connect: connect,
  query: query
};
