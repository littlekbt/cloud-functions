/**
 * Responds to any HTTP request that can provide a "message" field in the body.
 *
 * @param {!Object} req Cloud Function request context.
 * @param {!Object} res Cloud Function response context.
 */

function intersection(a, b) {
  var c = [];
  a.forEach(function(e){
    if(b.indexOf(e) >= 0){
      c.push(e);
    }
  })

  return c
}

// a: [1,2,3]
// b: {1: "foo", 2: "bar"}
let toName = (a, b) => a.map(aa => b[parseInt(aa)]);

function getTags() {
  
  var query = datastore.createQuery('Tag');

  return new Promise(function(resolve, reject){
    datastore.runQuery(query, function(err, entities, info) {
      var tags = {}
      entities.forEach(function(entity){
        tags[entity['id']] = entity['name'];
      })
      resolve(tags)
    })
  })
}

function getTodos(query){
  var requestTags = query['tags'];
  if(requestTags && requestTags.length > 0){
    requestTags = requestTags.map(e => parseInt(e))
  }

  var todos = [];

  // TODO: promise. must run after getTags.
  var q = datastore.createQuery('Todo');

  if(query['todo']){
    q = q.filter('name', query['todo']);
  }

  // IN is not supported...
  return new Promise(function(resolve, reject){
    q.run(function(err, entities, info){
      entities.forEach(function(entity){
        // requestTagsがあった場合は絞り込みを行う
        if(requestTags) {
          if(intersection(requestTags, entity['tags']).length > 0){
            todos.push({'name': entity['name'], 'tags': entity['tags'], 'created': entity['created']});
          }
        }else{
          todos.push({'name': entity['name'], 'tags': entity['tags'], 'created': entity['created']});
        }
      })
      resolve(todos);
    })
  });
}

function index(req, res) {
  return new Promise(function(resolve, reject) {
    // method chainではなく、順番を守りたいだけなので、asyncで対応
    const async = require('async');
    async.series([
      function(callback) {
        getTags().then((tags) => callback(null, tags));
      },
      function(callback) {
        getTodos(req.query).then((todos) => callback(null, todos));
      }
    ], function(err, results){
      var tags  = results[0];
      var todos = results[1];
      // todoのtagをtoname
      if (err) {
        reject(err) 
      } else {
        resolve(JSON.stringify(todos.map((todo) => {return {'name': todo.name, 'tags': toName(todo.tags, tags), 'created': todo.created}})));
      }
    })
  })
}

function invert(obj){
  var r = {};
  Object.keys(obj).forEach(function(key) {
    r[obj[key]] = key;
  })
  return r
}

function findOrCreateTags(requestTags) {
  return new Promise(function(resolve, reject){
    getTags().then(function(tags){
      const tagIds = Object.keys(tags).map((e) => parseInt(e)).sort();
      const tagKey = datastore.key(['Tag']);
      const now = Date.now();
      var lastId = tagIds[tagIds.length - 1];
      var newTags = [];
      var attachTags = [];
      const inverted = invert(tags);

      (requestTags || []).forEach(function(t) {
        if(!t[0] || !tags[t[0]]) {
          if(!t[1]){
            reject("params not contain tag name");
            return
          }
          // nullであっても名前の重複は許さない
          if(inverted[t[1]]) {
            attachTags.push(inverted[t[1]]);
            return;
          }
          newTags.push({key: tagKey, data: {id: ++lastId, name: t[1], created: now}});
        }
        attachTags.push(t[0] || lastId)
      });
      datastore.save(newTags, function(err, apiResponse){
        if(err) {
          reject(err);
        } else {
          resolve(attachTags);
        }
      })
    });
  });
}

// in
// tags: [[1, "tag1"], [2, "tag2"], [null, "tag3"]]
// name: "todo1"

// out
// {name: "todo1", tags: ["tag1", "tag2", "tag3"]}
function create(req) {
  const params = req.body;
  return new Promise(function(resolve, reject){
    findOrCreateTags(params['tags']).then(function(tags) {
      if (!params['name']) {
        reject("params not contain name.");
        return
      }
      const todoKey = datastore.key(['Todo']);
      const data = {name: params['name'], created: Date.now(), tags: tags};
      datastore.save({key: todoKey, data: data}, function(err, apiResponse){
        if(err) {
          reject(err);
        } else {
          getTags().then(function(tags){
            resolve(JSON.stringify({'name': data.name, 'tags': toName(data.tags, tags), 'created': data.created}));
          });
        }
      });
    })
  });
}

// can update only todo
// int
// tags: [[1, "tag1"], [2, "tag2"]]
// name: "todo1_update"
// todo_id: xxxxx

// out
// {name: "todo1_update", tags: ["tag1", "tag2"]}
function update(req) {
  const params = req.body;
  return new Promise(function(resolve, reject) {
    findOrCreateTags(params['tags']).then(function(tags) {
      if (!params['name']) {
        reject("params not contain name.");
        return
      }
      if (!params['todo_id']) {
        reject("params not contain todo_id.");
        return
      }
      const todoKey = datastore.key(['Todo', params['todo_id']]);
      const data = {name: params['name'], tags: tags, created: params['created']};
      datastore.update({key: todoKey, data: data}, function(err, apiResponse){
        if (err) {
          reject(err);
        } else {
          getTags().then(function(tags){
            resolve(JSON.stringify({'name': data.name, 'tags': toName(data.tags, tags), 'created': data.created}));
          });
        }
      })
    })
  }) 
}

function del(req) {
  const params = req.body;
  return new Promise(function(resolve, reject) {
    if (!params['todo_id']) {
      reject("params not contain todo_id.");
      return
    }
    const todoKey = datastore.key(['Todo', params['todo_id']]);
    datastore.delete(todoKey, function(err, apiResponse){
      if(err){
        reject(err);
      }else{
        resolve({status: "success"}); 
      }
    })
  })
}

function onRejected(err){
  console.log(err);
}

exports.todos = function todos (req, res) {
  datastore = require('@google-cloud/datastore')({
    projectId: 'southern-lane-170005'
  });

  switch(req.method) {
    case 'GET':
      index(req).then((jsonStr) => res.send(jsonStr)).catch((err) => {onRejected(err); res.send(err)});
      break;
    case 'POST':
      create(req).then((jsonStr) => res.send(jsonStr)).catch((err) => {onRejected(err); res.send(err)});
      break;
    case 'PATCH':
      update(req).then((jsonStr) => res.send(jsonStr)).catch((err) => {onRejected(err); res.send(err)});
      break;
    case 'DELETE':
      del(req).then((jsonStr) => res.send(jsonStr)).catch((err) => {onRejected(err); res.send(err)});
      break;
  }
};

