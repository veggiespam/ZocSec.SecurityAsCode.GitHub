'use strict';

const AWS = require('aws-sdk');
const Octokit = require('@octokit/rest');
const kms = new AWS.KMS();
const apigateway = new AWS.APIGateway({apiVersion: '2015-07-09'});
AWS.config.update({region: process.env.AWS_REGION});

const encrypted = process.env.GITHUB_WEBHOOK_SECRET;
const secret = process.env.GITHUB_TOKEN;
let decrypted;
let decrypted_secret;
var all_hooks = [];


module.exports.initial_trigger = (event, context, callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Done! Navigate to Your Github Organizational Webhook Page to Verify Hook is Installed.'
    })
  };


  kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
            if (err) {
                console.log('Decrypt error:', err);
                return callback(err);
            }
            
            decrypted = data.Plaintext.toString('ascii');

  const params = {};
  var regex = /-github-webhook-listener/;
  console.log("**********************************************************"); // review cloudwatch log to see if this section has kick off for debugging
    apigateway.getRestApis(params, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred

      else {    
      for (var i = 0 ; i < data['items'].length; i++){
        //console.log(data);
        var api_names = data['items'][i]['name'];
        if ( regex.test(api_names) == true ){
          const api_id = data['items'][i]['id'];
          var params = {restApiId: api_id};
          
          apigateway.getStages(params, function(err2, data2) {

          if (err2) console.log(err2, err2.stack); // an error occurred

          else {     
            console.log(data2['item'][0]['stageName']);
           
            const stagename = data2['item'][0]['stageName'];
            const endpoint_URL = `https://${api_id}.execute-api.${process.env.AWS_REGION}.amazonaws.com/${stagename}/webhook`;
            console.log(endpoint_URL);


            kms.decrypt({ CiphertextBlob: new Buffer(secret, 'base64') }, (err, data) => {
            if (err) {
                console.log('Decrypt error:', err);
                return callback(err);
            }
              
            decrypted_secret = data.Plaintext.toString('ascii');

            //octokit.authenticate({ type: 'token',token: decrypted_secret }); 
            
            const octokit = new Octokit({
              auth: `token ${decrypted_secret}`
            });
            
            
            async function add_hook(organization){
              var config = {
                    url: endpoint_URL,
                    content_type:"json",
                    secret:decrypted
                    };
                const hook = await octokit.orgs.createHook({
                org: organization,
                name: 'web', 
                config,
                events: ['push','public','repository']});
                //For more on events see https://developer.github.com/v3/activity/events/types/
              }
            
            
            octokit.paginate('GET /user/orgs').then(org_data => { 
            for (var org of org_data){
              console.log(org.login);
              octokit.paginate(`GET /orgs/${org.login}/hooks`).then(any_webhook => {
              for ( var i = 0; i< any_webhook.length; i ++){
                all_hooks[i] = any_webhook[i]['config']['url'];
              }

              if (all_hooks.includes(endpoint_URL)){
                console.log(true);
              }
              else{
                add_hook(org.login);
                      
        }
        
          });  
         
            }
         });
              });

          }         
        });
      }
        
    }
      
    }
  });

   });
    

    callback(null, response);
  };
