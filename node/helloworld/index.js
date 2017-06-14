exports.helloWorld = function helloworld(req, res) {
  datastore = require('@google-cloud/datastore')({
    projectId: 'southern-lane-170005'
  });

  var q = datastore.createQuery('Todo');
  q.run(function(err, entities, info){
    res.send(entities);
  })
}
