/**
 * Implementation of some of Drupal's user system in Node.js.
 */
"use strict";

var db = require('./db'),
DRUPAL_ANONYMOUS_ID = 'anonymous',
DRUPAL_AUTHENTICATED_ID = 'authenticated',
unserialize = require('php-unserialize');

/**
 * Fetch a user object.
 *
 * Like user_load() in Drupal core.
 *
 * Currently, we only support loading by numeric user ids.
 */
function load(user_info, callback) {
  db.query("SELECT * FROM users WHERE uid = $1;", [user_info], function (err, rows) {
    if (err) {
      callback(err, null);
      return;
    }

    // When the user is loaded, get its roles.
    if (rows.length > 0) {
      var user = rows[0];

      user.roles = [];

      // Default roles.
      if (user.uid) {
        user.roles.push(DRUPAL_AUTHENTICATED_ID);

        // Load assigned roles for our user from the database.
        db.query("SELECT roles_target_id FROM user__roles WHERE entity_id = $1;", [user.uid], function (err, rows) {
          if (err) {
            callback(err, null);
          }

          if (rows.length > 0) {
            rows.forEach(function (row) {
              user.roles.push(row.roles_target_id);
            });
          }

          // Now we're done loading the user, call the callback.
          if (callback) {
            callback(null, user);
          }
        });
      }
      else {
        user.roles.push(DRUPAL_ANONYMOUS_ID);
        if (callback) {
          callback(null, user);
        }
      }
    }
    else {
      callback('User not found');
    }
  });
}

/**
 * Get all permissions granted to a set of roles.
 *
 * Like user_role_permissions() in Drupal core.
 */
function role_permissions(roles, callback) {
  var permissions = [],
      size = Object.keys(roles).length,
      i=0;
  if (roles) {
    // TODO: Here we could do with some caching like Drupal does.
    roles.forEach(function (key) {
      db.query("SELECT data FROM config WHERE name = $1;", ["user.role." + key], function (err, rows) {
        if (err) {
          callback(err, null);
        }

        if (rows.length > 0) {
          rows.forEach(function (row) {
            var permissionsObject = unserialize.unserialize(row.data).permissions;
            if (permissionsObject) {
              var permissionsArray = Object.keys(permissionsObject).map(function(j) {
                return permissionsObject[j];
              });
              permissions = permissions.concat(permissionsArray);
            }
          });
        }
        // we build the permissions object completely with all data from the queries before calling back
        if (i == size-1) {
          callback(null, permissions);
        }
        else {
          i=i+1;
          return;
        }
      });
    });
  }
}

/**
 * Check if user has a specific permission.
 *
 * Like user_access() in Drupal core.
 *
 * Unlike in Drupal, we do not have a global user object, so this
 * implementation always require the account parameter to be set.
 */
function access(permission, account, callback) {
  // User #1 has all privileges:
  if (account.uid === 1) {
    callback(null, true);
    return;
  }

  // If permissions is already loaded, use them.
  if (account.permissions) {
    callback(null, account.permissions.indexOf(permission) > -1);
    return;
  }

  role_permissions(account.roles, function (err, permissions) {
    if (err) {
      callback(err);
      return;
    }
    // Callback with the access result and the permissions array so we can reuse it in further access
    // requests
    callback(null, permissions.indexOf(permission) > -1, permissions);
    return;
  });

}

/**
 * Load a user session.
 *
 * This function does not exist in Drupal core, as it uses PHPs rather
 * complex session system we do not attempt to reconstruct here.
 *
 * This only works when Drupal uses the (default) database session
 * backend. Memcache and other session backends not supported.
 */
function session_load(sid, callback) {
  var rows = [];
  db.query("SELECT * FROM sessions WHERE sid = $1;", [sid], function (err, rows) {
    if (err) {
      callback(err, null);
      return;
    }

    if (rows.length > 0) {
      callback(null, rows[0]);
    }
    else {
      callback('Session not found', null);
    }
  });
}

module.exports = {
  access: access,
  load: load,
  role_permissions: role_permissions,
  session_load: session_load
};

