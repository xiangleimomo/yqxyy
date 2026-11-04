// Usage: node scripts/extract-dulo-stream.cjs harry-potter-philosophers-stone
// Prints a short-lived public playback URL. Do not commit its output to a catalogue.
const {resolveMovie}=require('../netlify/lib/dulo-stream.cjs');
resolveMovie(process.argv[2]).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
