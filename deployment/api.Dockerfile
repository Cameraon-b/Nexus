FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:a82c44c2efe00953d66a37e90d307c4cfbd1e974b16e3b2a2fc665331946c9af AS build
WORKDIR /src
COPY backend/ backend/
RUN dotnet publish backend/Nexus.Api/Nexus.Api.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:3a31a3c8c41f487ecab474cf6dcf152489fedca9fd145b0b49a4b9e616cd6dde
ARG NEXUS_COMMIT
LABEL org.opencontainers.image.revision=$NEXUS_COMMIT
WORKDIR /app
COPY --from=build /out/ ./
RUN mkdir /keys && chown app:app /keys && rm -f appsettings.Development.json
ENV ASPNETCORE_ENVIRONMENT=Production ASPNETCORE_HTTP_PORTS=8080 Nexus__DataProtectionPath=/keys
USER app
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s CMD ["dotnet", "Nexus.Api.dll", "--healthcheck"]
ENTRYPOINT ["dotnet", "Nexus.Api.dll"]
