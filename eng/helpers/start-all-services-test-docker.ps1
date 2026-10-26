# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

# Creates compose/.env with generated secrets when missing; an existing file is preserved.
& (Join-Path $PSScriptRoot 'initialize-env-file.ps1')

./compose/start-services.ps1 -Rebuild
