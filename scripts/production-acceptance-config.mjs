export const tlsImage='nginxinc/nginx-unprivileged:stable-alpine@sha256:e2a8fca8aa356d66159aaf8a877a9c126773635adf210503eefaaeaffeed6ad7';
const posix=p=>p.replaceAll('\\','/');
export function acceptanceEnvironment({commit,dir,octet,frontendPort}){
 return `NEXUS_COMMIT=${commit}\nNEXUS_SECRET_FILE=${posix(dir)}/database-password\nNEXUS_HOST=localhost\nNEXUS_EDGE_PROXY=10.253.${octet+1}.2\nNEXUS_FRONTEND_IP=10.253.${octet}.2\nNEXUS_SUBNET=10.253.${octet}.0/24\nNEXUS_DYNAMIC_RANGE=10.253.${octet}.128/25\nNEXUS_EDGE_SUBNET=10.253.${octet+1}.0/24\nNEXUS_EDGE_DYNAMIC_RANGE=10.253.${octet+1}.128/25\nNEXUS_PORT=${frontendPort}\n`;
}
export function tlsOverlay({tlsDir,tlsPort,octet}){
 return {services:{tls:{image:tlsImage,user:'101',healthcheck:{test:['CMD','wget','--no-check-certificate','-q','-O','/dev/null','https://127.0.0.1:8443/health/ready'],interval:'1s',timeout:'3s',retries:20},entrypoint:['nginx','-c','/accept/tls.conf','-g','daemon off;'],read_only:true,tmpfs:['/tmp'],security_opt:['no-new-privileges:true'],volumes:[`${posix(tlsDir)}:/accept:ro`],ports:[`127.0.0.1:${tlsPort}:8443`],networks:{edge:{ipv4_address:`10.253.${octet+1}.2`}}}}};
}
