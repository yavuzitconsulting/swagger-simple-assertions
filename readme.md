# swaggerSimpleAssertions

`swaggerSimpleAssertions` is a lightweight, easy-to-deploy Node.js tool for automated API testing based on a Swagger configuration. It automatically generates and executes assertions against your API, ensuring it works as expected.

## Features

- **Automatic Assertion Generation**: On the first run, `swaggerSimpleAssertions` generates `assertions.json` from your `swagger.json`, creating all necessary configurations for authentication and assertions against your API.
- **Easy Deployment with Docker**: Deploy `swaggerSimpleAssertions` using a Docker image that mounts `swagger.json`, making it easy to test any API.
- **Flexible Testing**: Configure and run the tool with or without authentication to perform various tests against your API.
- **Immediate Error Detection**: The tool stops at the first error, allowing you to quickly identify and resolve issues.

## How It Works

Requirements: please have curl installed and available in your PATH variable.

1. **First Run**: 
   - Input: `swagger.json`
   - Output: `assertions.json` containing configuration for authentication and assertions including expected status code and response keys.
2. **Subsequent Runs**: 
   - Executes commands based on `assertions.json`.
   - Stops at the first error for quick issue resolution.

## Conclusion

`swaggerSimpleAssertions` is a simple and effective tool for automated API testing based on Swagger configurations. Deploy it easily with Docker and ensure your API is working as expected.
