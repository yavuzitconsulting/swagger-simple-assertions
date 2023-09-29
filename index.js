import child_process from 'child_process';
const exec = child_process.exec;
import fs  from 'fs';
import https from 'https';
import { resolveObjectURL } from 'buffer';
//const path = '/config';
const path = "."

function main() {
    fs.readFile(`${path}/swagger.json`, 'utf8', (err, data) => {
        if (err) throw err;
        const swaggerJson = JSON.parse(data);
  
        // Check if assertions.json exists
        if (!fs.existsSync(`${path}/assertions.json`)) {
            // If not, create assertions.json with localhost as default host
            const assertions = {
                host: '{host:port}',
                scheme: '{http}',
                authority: '{keycloak/realm}',
                keycloak: '{keycloak}',
                token_endpoint: '{token_endpoint}',
                authorize_endpoint: '{authorize_endpoint}',
                client_name: '{client_name}',
                client_secret: '{client_secret}',
                scopes: '{scopes}',
                commands: createAssertions(generateCurlCommands(swaggerJson, '{host:port}', '{scheme}'))
            };
            fs.writeFileSync(`${path}/assertions.json`, JSON.stringify(assertions, null, 2));
        } else {
            // If yes, run the tool with assertions.json
            const assertions = JSON.parse(fs.readFileSync(`${path}/assertions.json`, 'utf8'));
            executeCommands(assertions);
        }
    });
}
function generateCurlCommands(swaggerJson, host, scheme) {
  const commands = [];
  for (const path in swaggerJson.paths) {
      for (const method in swaggerJson.paths[path]) {
          const endpoint = swaggerJson.paths[path][method];
          let command = `curl -X ${method.toUpperCase()}`;
          
          // Add Content-Type header for POST, PUT, and PATCH requests
          if (['post', 'put', 'patch'].includes(method.toLowerCase())) {
              command += ' -H "Content-Type: application/json"';
          }

          let url = `"${scheme}://${host}${path}"`;
          let parameters = [];
          
          if (endpoint.parameters) {
              endpoint.parameters.forEach(param => {
                  const paramPlaceholder = `{${param.name}}`;
                  if (param.in === 'query') {
                      parameters.push({ name: param.name, value: paramPlaceholder, in: 'query' });
                  } else if (param.in === 'path') {
                      url = url.replace(`{${param.name}}`, paramPlaceholder);
                      parameters.push({ name: param.name, value: paramPlaceholder, in: 'path' });
                  } else if (param.in === 'body') {
                      parameters.push({ name: param.name, value: paramPlaceholder, in: 'body' });
                  }
              });
          }

          command += " " + url;

          // Handling body parameters separately
          const bodyParams = parameters.filter(param => param.in === 'body').map(param => `${param.name}=${param.value}`);
          if (['post', 'put', 'patch'].includes(method.toLowerCase()) && bodyParams.length > 0) {
              command += " -d '" + JSON.stringify(bodyParams) + "'";
          }
          
          commands.push({ path, method, command, parameters });
      }
  }
  return commands;
}


function createAssertions(commands) {
  return commands.map(cmd => {
    return {
      command: cmd.command,
      parameters: cmd.parameters,
      expected: {
        statusCode: 200,
        response: {}
      }
    };
  });
}  

async function getAccessTokenFromKeycloak(assertions) {
  return new Promise(async (resolve, reject) => {
    // Add scopes to postData if assertions.scopes is defined and is an array
    const scopes = typeof assertions.scopes === 'string' ? assertions.scopes.replace(/\s*,\s*/g, ' ') : '';
    const postData = `client_id=${assertions.client_name}&client_secret=${assertions.client_secret}&grant_type=client_credentials&scope=${encodeURIComponent(scopes)}`;

    // Use the URL class to parse the token_endpoint into hostname and path components
    const url = new URL(assertions.token_endpoint);

    const options = {
      hostname: url.hostname, // parsed hostname from the token_endpoint
      port: url.port, // parsed port from the token_endpoint
      path: url.pathname, // parsed path from the token_endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };

    // Dynamically import the http or https module based on the URL protocol
    const protocol = url.protocol === 'https:' ? await import('https') : await import('http');
    const req = protocol.request(options, (res) => {
      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        console.log('Raw Response:', rawData);  // log raw data
        if(rawData.includes('invalid')) {
         
          console.error('Could not retrieve token: ' + rawData);
          process.exit(500); // Exit the process with code 500
          return;
        }
        try {
          const parsedData = JSON.parse(rawData);
          resolve(parsedData.access_token);
        } catch (e) {
          reject('Error parsing response: ' + rawData);
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}


async function executeCommands(assertions) {
  const accessToken = await getAccessTokenFromKeycloak(assertions);
  for (const cmd of assertions.commands) {
    let url = cmd.command.match(/\"({scheme}.*?)\"/)[1];
    const scheme = cmd.scheme || assertions.scheme;
    let constructedUrl = url.replace('{host:port}', assertions.host).replace('{scheme}', scheme);

    let pathParams = cmd.parameters.filter(param => param.in === 'path');
    for (const param of pathParams) {
      constructedUrl = constructedUrl.replace(`{${param.name}}`, param.value);
    }

    let queryParams = cmd.parameters.filter(param => param.in === 'query');
    let queryString = queryParams.map(param => `${param.name}=${param.value}`).join('&');
    if (queryString) {
      constructedUrl += `?${queryString}`;
    }

    // Constructing curl command
    let curlCmd = `curl -k -s -w "%{http_code}" `;
    if (scheme === 'https') {
      curlCmd += '--insecure ';
    }
    if (accessToken) {
      curlCmd += ` -H "Authorization: Bearer ${accessToken}"`;
    }
    curlCmd += ` "${constructedUrl}"`;

    // Handling body parameters
    let bodyParams = cmd.parameters.filter(param => param.in === 'body');
    if (bodyParams.length > 0) {
      let bodyData = bodyParams[0].value;
      curlCmd += ` -d "${JSON.stringify(bodyData)}"`;
    }

    try {
      // Executing curl command
      exec(curlCmd, async (error, stdout, stderr) => {
        // Log the command that is being executed
        console.log('RUN: ' + curlCmd);

        if (error) {
          // Log the error and the command if an error occurs
          console.error('Error with URL: ' + constructedUrl);
          console.error('Error message: ' + error.message);
          console.error('Command: ' + cmd.command);
          process.exit(500); // Exit the process with code 500
          return;
        }

        // Extracting HTTP status code from stdout
        const httpCode = stdout.match(/(\d{3})$/)[1]; // Assuming it's at the end
        stdout = stdout.replace(/(\d{3})$/, ''); // Removing http code from stdout

        // Checking the expected status code
        if (cmd.expected && cmd.expected.statusCode) {
          if (httpCode !== cmd.expected.statusCode) {
            console.error('Error: Unexpected status code for URL: ' + constructedUrl);
            console.error(`Expected: ${cmd.expected.statusCode}, Got: ${httpCode}`);
            console.error('ERROR WAS: ' + stdout);
            process.exit(500); // Exit the process with code 500
          }
        }

        // Checking the expected response keys
        if (cmd.expected && cmd.expected.response) {
          const expectedKeys = Object.keys(cmd.expected.response);
          if (expectedKeys.length > 0) {
            const responseBody = JSON.parse(stdout); // Assuming JSON response
            for (const key of expectedKeys) {
              if (!responseBody.hasOwnProperty(key)) {
                console.error(`Error: Missing key "${key}" in response for URL: ${constructedUrl}`);
                process.exit(500); // Exit the process with code 500
              }
            }
          }
        }

        if (stdout) {
          console.log(stdout);
          if (stdout.includes('exception')) {
            console.log("EXCEPTION OCURRED IN CONTROLLER: " + stdout);
            process.exit(500); // Exit the process with code 500
            return;
          }
        }

        if (stderr) {
          console.log(stderr);
        }
      });

    } catch (error) {
      console.error('Error: ' + constructedUrl, error.message);
      console.error('COMMAND: ' + cmd.command);
      process.exit(500); // Exit the process with code 500
    }
  }
}


// Call the main function as the entry point
main();
