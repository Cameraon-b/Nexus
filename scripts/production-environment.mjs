// --config-file is authoritative: Compose normally gives inherited shell values
// precedence over --env-file, which could attach an acceptance run to real secrets.
// Keep Docker connectivity/PATH settings, but discard interpolation/project overrides.
export function composeEnvironment(environment=process.env){
 return Object.fromEntries(Object.entries(environment).filter(([key])=>!key.toUpperCase().startsWith('NEXUS_')&&!key.toUpperCase().startsWith('COMPOSE_')));
}
