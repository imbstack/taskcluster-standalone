var fs = require('fs');

if (!process.env.PROC_NAME) {
  console.error('Must specify a process to start with PROC_NAME');
  process.exit(1);
}
var contents = fs.readFileSync('Procfile').toString();
var procs = {};
contents.split('\n').forEach(function(l) {
  if (l.indexOf(':') === -1) {
    return;
  }
  var ar = l.split(':');
  procs[ar[0].trim()] =  ar[1].trim();
});
var proc = procs[process.env.PROC_NAME];
if (proc) {
  console.log(proc);
} else {
  console.error('Process "' + process.env.PROC_NAME + '" does not exist!');
  process.exit(1);
}
