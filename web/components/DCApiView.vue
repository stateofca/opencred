<!--
Copyright 2023 - 2024 California Department of Motor Vehicles
Copyright 2023 - 2024 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<script setup>
import { inject, onMounted, ref } from "vue";
import CountdownDisplay from "./CountdownDisplay.vue";
import { httpClient } from "@digitalbazaar/http-client";
import { useQuasar } from "quasar";

const props = defineProps({
    active: {
        type: Boolean,
        default: false,
    },
    brand: {
        type: Object,
        default: () => ({
            primary: "",
        }),
    },
    exchangeData: {
        type: Object,
        default: () => ({
            id: "",
            workflowId: "",
            accessToken: "",
            ttl: 900,
            createdAt: new Date(),
        }),
    },
    rp: {
        type: Object,
        default: () => ({}),
    },
});

const emit = defineEmits([
    "replaceExchange",
    "overrideActive",
    "switchView",
    "resetExchange",
]);
const $q = useQuasar();
const $cookies = inject("$cookies");

const isLoading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const dcApiSupported = ref(false);
const redirectData = ref(null);

// Check if DC API is supported
onMounted(() => {
    console.log("DCApiView mounted");
    dcApiSupported.value = typeof window.DigitalCredential !== "undefined";

    if (!dcApiSupported.value) {
        console.error(
            "Digital Credentials API is not supported in this browser",
        );
        errorMessage.value =
            "The Digital Credentials API is not supported in this browser.";
    }
});

async function startDCApiFlow() {
    try {
        isLoading.value = true;
        errorMessage.value = "";
        successMessage.value = "";

        console.log("Starting DC API flow...");
        console.log("Exchange data:", props.exchangeData);
        console.log("Workflow ID:", props.exchangeData.workflowId);
        console.log("Exchange ID:", props.exchangeData.id);

        // Get the authorization request from the server
        const requestUrl =
            `/workflows/${props.exchangeData.workflowId}` +
            `/exchanges/${props.exchangeData.id}` +
            `/dc-api/request`;

        console.log("Requesting from:", requestUrl);

        const { data: authRequest } = await httpClient.get(requestUrl, {
            headers: {
                Authorization: `Bearer ${props.exchangeData.accessToken}`,
            },
        });

        console.log("DC API authorization request received:", authRequest);

        // Use the Digital Credentials API to get credentials
        const controller = new AbortController();

        console.log("Calling navigator.credentials.get()...");
        const credentialResponse = await navigator.credentials.get({
            signal: controller.signal,
            mediation: "silent",
            digital: authRequest,
        });

        console.log("DC API credential response:", credentialResponse);

        if (credentialResponse) {
            // Send the response back to the server
            const responseUrl =
                `/workflows/${props.exchangeData.workflowId}` +
                `/exchanges/${props.exchangeData.id}` +
                `/dc-api/response`;

            console.log("Sending response to:", responseUrl);

            const { data: result } = await httpClient.post(responseUrl, {
                json: credentialResponse,
                headers: {
                    Authorization: `Bearer ${props.exchangeData.accessToken}`,
                },
            });

            console.log("DC API response result:", result);
            successMessage.value = "Credential presentation successful!";

            // Update the exchange if needed
            if (result.exchange) {
                emit("replaceExchange", result.exchange);
            }

            // Store redirect data for manual continuation
            const oidcState =
                props.exchangeData.oidc?.state || result.exchange?.oidc?.state;
            const oidcCode = result.exchange?.oidc?.code;

            if (oidcState && oidcCode && props.rp.redirectUri) {
                const queryParams = new URLSearchParams({
                    state: oidcState,
                    code: oidcCode,
                });
                redirectData.value = `${props.rp.redirectUri}?${queryParams.toString()}`;
                console.log("Redirect URL prepared:", redirectData.value);
            } else {
                console.warn("Missing OIDC parameters for redirect:", {
                    state: oidcState,
                    code: oidcCode,
                    redirectUri: props.rp.redirectUri,
                });
            }
        } else {
            errorMessage.value = "No credential was provided.";
        }
    } catch (error) {
        console.error("DC API Error:", error);

        // Handle specific error types
        if (error.name === "NotAllowedError") {
            errorMessage.value =
                "The credential request was denied or cancelled.";
        } else if (error.name === "AbortError") {
            errorMessage.value = "The credential request was aborted.";
        } else if (error.message) {
            errorMessage.value = error.message;
        } else {
            errorMessage.value =
                "An error occurred during credential presentation.";
        }
    } finally {
        isLoading.value = false;
    }
}

const retry = () => {
    console.log("Retrying DC API flow...");
    // Reset the exchange to get a fresh session before retrying
    // emit("resetExchange");
    // Small delay to allow the reset to complete
    setTimeout(() => {
        startDCApiFlow();
    }, 1000);
};

const handleGoBack = () => {
    emit("overrideActive");
};

const switchToOtherMethod = () => {
    console.log("Switching to another authentication method...");
    emit("switchView");
};

const continueToRelyingParty = () => {
    if (redirectData.value) {
        console.log("Redirecting to:", redirectData.value);
        window.location.href = redirectData.value;
    } else {
        console.error("No redirect URL available");
        errorMessage.value = "Unable to continue - no redirect URL available.";
        successMessage.value = "";
    }
};
</script>

<template>
    <div
        class="-mt-72 bg-white z-10 mx-auto p-10 rounded-md max-w-3xl px-16 lg:px-24 relative text-center"
    >
        <h1 class="text-3xl mb-8 text-center" :style="{ color: brand.primary }">
            {{ $t("dcApiTitle") || "Verify with Digital Credential" }}
        </h1>
        <!-- Loading State -->
        <div v-if="isLoading" class="p-8 justify-center">
            <div class="mx-auto w-12 mb-6">
                <q-spinner-tail color="primary" size="3em" />
            </div>
            <p class="text-lg mb-4">
                {{
                    $t("dcApiLoading") ||
                    "Requesting your digital credential..."
                }}
            </p>
            <p class="text-sm text-gray-600">
                {{
                    $t("dcApiLoadingHelp") ||
                    "Please follow the prompts in your browser to select and share your credential."
                }}
            </p>
        </div>

        <!-- Success State -->
        <div v-else-if="successMessage" class="p-8 justify-center">
            <div class="mx-auto w-16 mb-4">
                <q-icon name="check_circle" color="positive" size="4em" />
            </div>
            <p class="text-lg text-green-600 mb-6">
                {{ successMessage }}
            </p>
            <div class="mt-6">
                <q-btn
                    color="primary"
                    @click="continueToRelyingParty"
                    size="lg"
                >
                    {{ $t("dcApiContinue") || "Continue" }}
                </q-btn>
            </div>
            <div class="mt-4">
                <button
                    class="text-sm underline text-gray-600"
                    @click="handleGoBack"
                >
                    {{ $t("dcApiCancel") || "Cancel" }}
                </button>
            </div>
        </div>

        <!-- Error State -->
        <div v-else-if="errorMessage" class="p-8 justify-center">
            <div class="mx-auto w-16 mb-4">
                <q-icon name="error_outline" color="negative" size="4em" />
            </div>
            <p class="text-lg text-red-600 mb-2">
                {{ $t("dcApiError") || "Unable to verify credential" }}
            </p>
            <p class="text-sm mb-6 text-gray-700">
                {{ errorMessage }}
            </p>
            <div class="space-y-3">
                <div v-if="dcApiSupported">
                    <q-btn color="primary" @click="retry" class="mb-3">
                        {{ $t("dcApiRetry") || "Try Again" }}
                    </q-btn>
                </div>
                <div>
                    <button
                        class="text-sm underline"
                        :style="{ color: brand.primary }"
                        @click="switchToOtherMethod"
                    >
                        {{
                            $t("dcApiSwitchMethod") ||
                            "Use a different verification method"
                        }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Initial/Waiting State (show start button) -->
        <div v-else class="p-8 justify-center">
            <div class="mx-auto w-16 mb-4">
                <q-icon name="badge" color="primary" size="4em" />
            </div>
            <q-btn
                color="primary"
                @click="startDCApiFlow"
                size="lg"
                :disabled="!dcApiSupported"
            >
                {{ $t("dcApiReady") || "Start Verification" }}
            </q-btn>
        </div>

        <!-- Countdown Timer -->
        <div class="mt-8 border-t pt-4">
            <p class="text-sm text-gray-600">
                {{ $t("exchangeActiveExpiryMessage") || "Session expires in" }}
                <CountdownDisplay
                    :created-at="props.exchangeData.createdAt"
                    :ttl="props.exchangeData.ttl"
                />
            </p>
        </div>

        <!-- Alternative Method Link (always visible) -->
        <div class="mt-4" v-if="!successMessage">
            <p class="text-xs text-gray-500">
                {{ $t("dcApiHavingTrouble") || "Having trouble?" }}
                <button
                    class="underline ml-1"
                    :style="{ color: brand.primary }"
                    @click="switchToOtherMethod"
                >
                    {{ $t("dcApiTryAnotherWay") || "Try another way" }}
                </button>
            </p>
        </div>
    </div>
</template>

<style scoped>
.space-y-3 > * + * {
    margin-top: 0.75rem;
}
</style>
