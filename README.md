# The Open Credentials Platform

## Usage

### Directly

```sh
$ npm i
$ node index.js
```

### via Docker

```sh
$ docker built . -t opencred-platform
$ docker run -p 8080:8080 -d opencred-platform
$ curl http://localhost:8080/health
```

## License

BSD-3-Clause
