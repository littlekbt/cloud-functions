exports.readCloudStorage = function helloWorld(req, res) {
  var storage = require('@google-cloud/storage');
  var gcs = storage({
    projectId: 'slider-165214'
  });
  
  var bucket = gcs.bucket("sample-littlekbt");
  var f = bucket.file('sample.json');
  var s = "";
  
  var readableStream = f.createReadStream();
  readableStream.on('data', function(data) {
    s += data.toString();
  });

  readableStream.on('end', function() {
    res.send(s);
  });
};
