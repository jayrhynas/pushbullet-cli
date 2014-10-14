#!/usr/bin/env node
var _ = require('lodash')
  , fs = require('fs')
  , inquirer = require('inquirer')
  , path = require('path')
  , unirest = require('unirest')
  , sprintf = require('sprintf-js').sprintf
  , sync = require('sync')
  , validator = require('validator')
  , program = require('commander')
  ;

program.version('0.0.1')
  .option('--type <type>', 'Type of push (Note, Link, Address, List, File)')
  .option('--title <title>', 'Title of push [Note, Link, List]')
  .option('--body <body>', 'Body of push [Note]')
  .option('--url <url>', 'URL to push [Link]')
  .option('--name <name>', 'Name of place [Address]')
  .option('--address <address>', 'Address of place [Address]')
  .option('--items <items>', 'List of items (comma-delimited) [List]')
  .option('--filename <filename>', 'Filename of file to send [File]')
  .parse(process.argv);


sync(function() {
  var config = {};
  var configPath = path.join(process.env.HOME, '.pushbullet/config.json');

  loadConfig(configPath, config);

  if (process.argv.length == 2) {
    getAPIKey.sync();

    inquirer.prompt([{
      type: 'checkbox',
      name: 'devices',
      message: 'What devices do you want to push to?',
      choices: getDevices,
      validate: function(devices) {
        return devices.length > 0;
      }
    }, {
      type: 'list',
      name: 'type',
      message: 'What type of push?',
      choices: ['Note', 'Link', 'Address', 'List', 'File'],
      default: 'Note',
      filter: function(type) { return type.toLowerCase() }
    }, {
      type: 'input',
      name: 'title',
      message: 'Title:',
      when: function(answers) { return _.contains(['note', 'link', 'list'], answers.type); }
    }, {
      type: 'input',
      name: 'body',
      message: 'Body:',
      when: function(answers) { return _.contains(['note'], answers.type); },
    }, {
      type: 'input',
      name: 'url',
      message: 'URL:',
      when: function(answers) { return _.contains(['link'], answers.type); },
      validate: function(url) { return validator.isURL(url); }
    }, {
      type: 'input',
      name: 'name',
      message: 'Place Name:',
      when: function(answers) { return _.contains(['address'], answers.type); },
    }, {
      type: 'input',
      name: 'address',
      message: 'Address:',
      when: function(answers) { return _.contains(['address'], answers.type); },
    }, {
      type: 'input',
      name: 'items',
      message: 'List Items (comma-delimited):',
      when: function(answers) { return _.contains(['list'], answers.type); },
      filter: function(listItems) { return listItems.split(',').map(function(item) { return item.trim(); }); }
    }, {
      type: 'input',
      name: 'filename',
      message: 'Filename:',
      when: function(answers) { return _.contains(['file'], answers.type); },
      validate: function(filename) { return fs.existsSync(path.resolve(filename)); },
      filter: function(filename) { return path.resolve(filename); }
    }], function(answers) {
      answers.devices.forEach(function(device) {
        var request = unirest.post('https://api.pushbullet.com/api/pushes').auth(config.apiKey, '');
        if (answers.type == 'file') {
          request.field('device_iden', device)
          .field('type', 'file')
          .attach('file', fs.createReadStream('test.txt'));
        } else {
          request.send(_.extend({'device_iden': device}, _.pick(answers, ['type', 'title', 'body', 'url', 'name', 'address', 'items'])));
        }
        request.end();
      });
    });
  } else {
    var request = unirest.post('https://api.pushbullet.com/api/pushes').auth(config.apiKey, '');
    if (program.type == 'file') {
      request.field('type', 'file')
        .attach('file', fs.createReadStream('test.txt'));
    } else {
      request.send(_.pick(program, ['type', 'title', 'body', 'url', 'name', 'address', 'items']));
    }
    request.end();
  }

  //------------------------------------------------
  //------------------------------------------------

  function loadConfig(configPath, config) {
    if (fs.existsSync(configPath)) _.extend(config, require(configPath));
  }

  function saveConfig(configPath, config) {
    fs.writeFile(configPath, JSON.stringify(config), function(err) {
      if (err) console.err('Error writing config file:', err)
    });
  }

  function getAPIKey(cb) {
    inquirer.prompt([{
      type: 'input',
      name: 'apiKey',
      message: 'What\'s your Pushbullet API Key?',
      when: function() { return config.apiKey == undefined; },
      validate: function(key) {
        return key.length == 45;
      }
    }], function(answers) {
      if (answers.apiKey) {
        config.apiKey = answers.apiKey;
        saveConfig(configPath, config);
      }
      cb();
    });
  }

  function getDevices() {
    var request = unirest.get('https://api.pushbullet.com/v2/devices').auth(config.apiKey, '');
    var response = (function(cb) { request.end(function(response) { cb(null, response) }) }).sync();
    if (response.code == 200) {
      return response.body.devices.map(function(device) {
        return { name: device.nickname, value: device.iden };
      });
    } else {
      return [];
    }
  }
});