// vim: et sw=2 ts=2
/* global module, require */

const fs = require('fs');
const path = require('path');


function assert_exists(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }
  return file;
}

function add_prefix(left, right) {
  return assert_exists(path.join(left, right));
}


module.exports = function(grunt) {
  'use strict';

  const dist = 'dist';
  const pkg = grunt.file.readJSON('package.json');

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify-es');

  grunt.initConfig({
    pkg,

    concat: {

      app_deps: {
        src: [
          "../node_modules/ifrpc/src/ifrpc.js",
          "loader.js"
        ].map(x => add_prefix('src', x)),
        dest: `${dist}/forsta-messenger-client.js`
      }
    },

    uglify: {
      options: {
        mangle: {
          safari10: true,
          keep_fnames: true
        },
        compress: {
          unused: false,
          keep_fnames: true
        },
        output: {
          max_line_len: 1000,
          safari10: true
        }
      },

      lib: {
        files: [{
          src: `${dist}/forsta-messenger-client.js`,
          dest: `${dist}/forsta-messenger-client.min.js`
        }]
      }
    }
  });

  grunt.registerTask('default', ['concat', 'uglify']);
};
