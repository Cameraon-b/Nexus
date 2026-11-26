// Sanitized default ASP.NET Core managed AES-256-CBC/HMACSHA256 key layout.
// Public all-zero test material, never a deployed key.
export const keyId='01234567-89ab-cdef-0123-456789abcdef';
export const keyName=`key-${keyId}.xml`;
export const keyXml=`<?xml version="1.0" encoding="utf-8"?>
<key id="${keyId}" version="1">
 <creationDate>2026-01-01T00:00:00Z</creationDate>
 <activationDate>2026-01-01T00:00:00Z</activationDate>
 <expirationDate>2026-04-01T00:00:00Z</expirationDate>
 <descriptor deserializerType="Microsoft.AspNetCore.DataProtection.AuthenticatedEncryption.ConfigurationModel.AuthenticatedEncryptorDescriptorDeserializer, Microsoft.AspNetCore.DataProtection, Version=10.0.0.0, Culture=neutral, PublicKeyToken=adb9793829ddae60">
  <descriptor><encryption algorithm="AES_256_CBC" /><validation algorithm="HMACSHA256" />
   <masterKey p4:requiresEncryption="true" xmlns:p4="http://schemas.asp.net/2015/03/dataProtection">
    <!-- Warning: the key below is in an unencrypted form. -->
    <value>${Buffer.alloc(64).toString('base64')}</value>
   </masterKey>
  </descriptor>
 </descriptor>
</key>`;
