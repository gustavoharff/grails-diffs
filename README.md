# grails-diffs

Generating a release:

```bash
./release.sh <version> <profile> <type>
```

- type: `app` or `plugin`;

Example:

```bash
./release.sh 5.0.0 'rest-api' 'app'
```

| Version | web | web-plugin | rest-api | rest-api-plugin |
| ------- | --- | ---------- | -------- | --------------- |
| 5.0.0   | X   | X          | X        | X               |
