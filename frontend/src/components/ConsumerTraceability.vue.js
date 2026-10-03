import { computed, onMounted, ref } from 'vue';
import { verifyCrop, formatDate, formatDateTime, truncateAddress, GANACHE_RPC, CONTRACT_ADDRESS, } from '../consumerTraceability';
const props = defineProps();
const cropIdInput = ref('');
const loading = ref(false);
const errorMessage = ref('');
const verifiedCrop = ref(null);
const copiedAddress = ref(null);
// Find supplier movement if present
const supplierMovement = computed(() => {
    if (!verifiedCrop.value)
        return undefined;
    return verifiedCrop.value.movements.find((m) => m.toRole.trim().toLowerCase().includes('supplier'));
});
// Find retailer movement if present
const retailerMovement = computed(() => {
    if (!verifiedCrop.value)
        return undefined;
    return verifiedCrop.value.movements.find((m) => m.toRole.trim().toLowerCase().includes('retailer'));
});
// Current holder role description
const currentHolderRole = computed(() => {
    if (!verifiedCrop.value)
        return '';
    const holder = verifiedCrop.value.currentHolder.toLowerCase();
    const farmer = verifiedCrop.value.farmer.toLowerCase();
    if (holder === farmer) {
        return 'Farmer (Original Producer)';
    }
    // Find most recent movement matching the holder
    const matchingMovement = [...verifiedCrop.value.movements]
        .reverse()
        .find((m) => m.to.toLowerCase() === holder);
    if (matchingMovement) {
        return `${matchingMovement.toRole} (Current Custodian)`;
    }
    return 'Authorized Custodian';
});
async function handleVerify() {
    errorMessage.value = '';
    verifiedCrop.value = null;
    const input = cropIdInput.value.trim();
    if (!input) {
        errorMessage.value = 'Please enter a Crop ID to verify.';
        return;
    }
    loading.value = true;
    try {
        const result = await verifyCrop(input);
        verifiedCrop.value = result;
    }
    catch (err) {
        errorMessage.value =
            err instanceof Error ? err.message : 'Unable to verify crop.';
    }
    finally {
        loading.value = false;
    }
}
function copyToClipboard(text) {
    if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
        copiedAddress.value = text;
        setTimeout(() => {
            if (copiedAddress.value === text) {
                copiedAddress.value = null;
            }
        }, 2000);
    }
}
onMounted(() => {
    // Check URL query parameters for cropId (e.g. ?cropId=1)
    const urlParams = new URLSearchParams(window.location.search);
    const urlCropId = urlParams.get('cropId') || urlParams.get('id');
    if (props.initialCropId) {
        cropIdInput.value = String(props.initialCropId);
        handleVerify();
    }
    else if (urlCropId) {
        cropIdInput.value = urlCropId;
        handleVerify();
    }
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['farmer-link']} */ ;
/** @type {__VLS_StyleScopedClasses['search-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['verify-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['state-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['state-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['state-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['error-state']} */ ;
/** @type {__VLS_StyleScopedClasses['state-text']} */ ;
/** @type {__VLS_StyleScopedClasses['state-text']} */ ;
/** @type {__VLS_StyleScopedClasses['state-text']} */ ;
/** @type {__VLS_StyleScopedClasses['state-text']} */ ;
/** @type {__VLS_StyleScopedClasses['status-badge-info']} */ ;
/** @type {__VLS_StyleScopedClasses['status-badge-info']} */ ;
/** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
/** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
/** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
/** @type {__VLS_StyleScopedClasses['copy-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper-item']} */ ;
/** @type {__VLS_StyleScopedClasses['pending']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper-item']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper-header']} */ ;
/** @type {__VLS_StyleScopedClasses['step-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['step-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['pending']} */ ;
/** @type {__VLS_StyleScopedClasses['stepper-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-text']} */ ;
/** @type {__VLS_StyleScopedClasses['movements-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['movements-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-movements']} */ ;
/** @type {__VLS_StyleScopedClasses['cell-addr']} */ ;
/** @type {__VLS_StyleScopedClasses['specs-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
/** @type {__VLS_StyleScopedClasses['full-col']} */ ;
/** @type {__VLS_StyleScopedClasses['status-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['status-holder-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['search-card']} */ ;
/** @type {__VLS_StyleScopedClasses['search-form']} */ ;
/** @type {__VLS_StyleScopedClasses['verify-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['specs-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
/** @type {__VLS_StyleScopedClasses['full-col']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "consumer-app app-shell" },
});
/** @type {__VLS_StyleScopedClasses['consumer-app']} */ ;
/** @type {__VLS_StyleScopedClasses['app-shell']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "topbar" },
});
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "eyebrow" },
});
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header-actions" },
});
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    href: "/",
    ...{ class: "farmer-link" },
    title: "Switch to Farmer Portal",
});
/** @type {__VLS_StyleScopedClasses['farmer-link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "network-chip" },
});
/** @type {__VLS_StyleScopedClasses['network-chip']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "dot" },
});
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "content" },
});
/** @type {__VLS_StyleScopedClasses['content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "hero-card search-card" },
});
/** @type {__VLS_StyleScopedClasses['hero-card']} */ ;
/** @type {__VLS_StyleScopedClasses['search-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "search-intro" },
});
/** @type {__VLS_StyleScopedClasses['search-intro']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "section-kicker" },
});
/** @type {__VLS_StyleScopedClasses['section-kicker']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (__VLS_ctx.handleVerify) },
    ...{ class: "search-form" },
});
/** @type {__VLS_StyleScopedClasses['search-form']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "search-input-wrap" },
});
/** @type {__VLS_StyleScopedClasses['search-input-wrap']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "search-prefix" },
});
/** @type {__VLS_StyleScopedClasses['search-prefix']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    value: (__VLS_ctx.cropIdInput),
    type: "text",
    ...{ class: "search-input" },
    placeholder: "e.g. 1",
    autocomplete: "off",
    disabled: (__VLS_ctx.loading),
});
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    type: "submit",
    ...{ class: "verify-btn" },
    disabled: (__VLS_ctx.loading || !__VLS_ctx.cropIdInput.trim()),
});
/** @type {__VLS_StyleScopedClasses['verify-btn']} */ ;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spinner" },
    });
    /** @type {__VLS_StyleScopedClasses['spinner']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.loading ? 'Verifying...' : 'Verify Product');
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "panel state-panel loading-state" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['state-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['loading-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spinner-large" },
    });
    /** @type {__VLS_StyleScopedClasses['spinner-large']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state-text" },
    });
    /** @type {__VLS_StyleScopedClasses['state-text']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    (__VLS_ctx.truncateAddress(__VLS_ctx.CONTRACT_ADDRESS));
}
else if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "panel state-panel error-state" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['state-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['error-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state-icon error-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['state-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['error-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "state-text" },
    });
    /** @type {__VLS_StyleScopedClasses['state-text']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "error-msg" },
    });
    /** @type {__VLS_StyleScopedClasses['error-msg']} */ ;
    (__VLS_ctx.errorMessage);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "error-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['error-hint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    (__VLS_ctx.GANACHE_RPC);
}
else if (__VLS_ctx.verifiedCrop) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "verification-container" },
    });
    /** @type {__VLS_StyleScopedClasses['verification-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "status-banner" },
    });
    /** @type {__VLS_StyleScopedClasses['status-banner']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "status-badge-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['status-badge-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "status-badge-info" },
    });
    /** @type {__VLS_StyleScopedClasses['status-badge-info']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "badge-title-row" },
    });
    /** @type {__VLS_StyleScopedClasses['badge-title-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "status-badge verified" },
    });
    /** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['verified']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "status-crop-id" },
    });
    /** @type {__VLS_StyleScopedClasses['status-crop-id']} */ ;
    (__VLS_ctx.verifiedCrop.cropId);
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.verifiedCrop.cropName);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "status-holder-preview" },
    });
    /** @type {__VLS_StyleScopedClasses['status-holder-preview']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "preview-label" },
    });
    /** @type {__VLS_StyleScopedClasses['preview-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "preview-role" },
    });
    /** @type {__VLS_StyleScopedClasses['preview-role']} */ ;
    (__VLS_ctx.currentHolderRole);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "preview-addr" },
        title: (__VLS_ctx.verifiedCrop.currentHolder),
    });
    /** @type {__VLS_StyleScopedClasses['preview-addr']} */ ;
    (__VLS_ctx.truncateAddress(__VLS_ctx.verifiedCrop.currentHolder));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel specs-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['specs-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "badge-pill" },
    });
    /** @type {__VLS_StyleScopedClasses['badge-pill']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "specs-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['specs-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value highlight" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    /** @type {__VLS_StyleScopedClasses['highlight']} */ ;
    (__VLS_ctx.verifiedCrop.cropId);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    (__VLS_ctx.verifiedCrop.cropName);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    (__VLS_ctx.verifiedCrop.cropType);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    (__VLS_ctx.verifiedCrop.quantity);
    (__VLS_ctx.verifiedCrop.unit);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card full-col" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['full-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "address-copy-row" },
    });
    /** @type {__VLS_StyleScopedClasses['address-copy-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value mono" },
        title: (__VLS_ctx.verifiedCrop.farmer),
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    /** @type {__VLS_StyleScopedClasses['mono']} */ ;
    (__VLS_ctx.verifiedCrop.farmer);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    throw 0;
                if (!!(__VLS_ctx.errorMessage))
                    throw 0;
                if (!(__VLS_ctx.verifiedCrop))
                    throw 0;
                return (__VLS_ctx.copyToClipboard(__VLS_ctx.verifiedCrop.farmer));
                // @ts-ignore
                [handleVerify, cropIdInput, cropIdInput, loading, loading, loading, loading, loading, truncateAddress, truncateAddress, CONTRACT_ADDRESS, errorMessage, errorMessage, GANACHE_RPC, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, currentHolderRole, copyToClipboard,];
            } },
        type: "button",
        ...{ class: "copy-btn" },
        title: "Copy Farmer Address",
    });
    /** @type {__VLS_StyleScopedClasses['copy-btn']} */ ;
    (__VLS_ctx.copiedAddress === __VLS_ctx.verifiedCrop.farmer ? 'Copied!' : 'Copy');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    (__VLS_ctx.verifiedCrop.location);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    (__VLS_ctx.formatDate(__VLS_ctx.verifiedCrop.cultivationDate));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    (__VLS_ctx.formatDate(__VLS_ctx.verifiedCrop.expectedHarvestDate));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "status-pill" },
        ...{ class: (__VLS_ctx.verifiedCrop.isHarvested ? 'harvested' : 'pending') },
    });
    /** @type {__VLS_StyleScopedClasses['status-pill']} */ ;
    (__VLS_ctx.verifiedCrop.isHarvested ? '✓ Harvested' : '⏳ In Cultivation');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    (__VLS_ctx.verifiedCrop.isHarvested
        ? __VLS_ctx.formatDateTime(__VLS_ctx.verifiedCrop.harvestTimestamp)
        : 'Not yet harvested');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spec-card full-col" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['full-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "label-with-role" },
    });
    /** @type {__VLS_StyleScopedClasses['label-with-role']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-label" },
    });
    /** @type {__VLS_StyleScopedClasses['spec-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "role-tag" },
    });
    /** @type {__VLS_StyleScopedClasses['role-tag']} */ ;
    (__VLS_ctx.currentHolderRole);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "address-copy-row" },
    });
    /** @type {__VLS_StyleScopedClasses['address-copy-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "spec-value mono" },
        title: (__VLS_ctx.verifiedCrop.currentHolder),
    });
    /** @type {__VLS_StyleScopedClasses['spec-value']} */ ;
    /** @type {__VLS_StyleScopedClasses['mono']} */ ;
    (__VLS_ctx.verifiedCrop.currentHolder);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    throw 0;
                if (!!(__VLS_ctx.errorMessage))
                    throw 0;
                if (!(__VLS_ctx.verifiedCrop))
                    throw 0;
                return (__VLS_ctx.copyToClipboard(__VLS_ctx.verifiedCrop.currentHolder));
                // @ts-ignore
                [verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, currentHolderRole, copyToClipboard, copiedAddress, formatDate, formatDate, formatDateTime,];
            } },
        type: "button",
        ...{ class: "copy-btn" },
        title: "Copy Current Holder Address",
    });
    /** @type {__VLS_StyleScopedClasses['copy-btn']} */ ;
    (__VLS_ctx.copiedAddress === __VLS_ctx.verifiedCrop.currentHolder ? 'Copied!' : 'Copy');
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "panel timeline-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['timeline-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "section-kicker" },
    });
    /** @type {__VLS_StyleScopedClasses['section-kicker']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "scope-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['scope-badge']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "timeline-stepper" },
    });
    /** @type {__VLS_StyleScopedClasses['timeline-stepper']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-item completed" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['completed']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-marker" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-marker']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "marker-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['marker-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-content" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-header" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "step-badge completed" },
    });
    /** @type {__VLS_StyleScopedClasses['step-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['completed']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "stepper-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-desc']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.verifiedCrop.location);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-item" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    (__VLS_ctx.truncateAddress(__VLS_ctx.verifiedCrop.farmer));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-item" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.formatDate(__VLS_ctx.verifiedCrop.cultivationDate));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-arrow" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-arrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "arrow-line" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-line']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "arrow-char" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-char']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-item completed" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['completed']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-marker" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-marker']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "marker-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['marker-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-content" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-header" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "step-badge completed" },
    });
    /** @type {__VLS_StyleScopedClasses['step-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['completed']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "stepper-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-desc']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.verifiedCrop.quantity);
    (__VLS_ctx.verifiedCrop.unit);
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.verifiedCrop.cropName);
    (__VLS_ctx.verifiedCrop.cropType);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-item" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.verifiedCrop.cropId);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-item" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.formatDateTime(__VLS_ctx.verifiedCrop.createdAt));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-arrow" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-arrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "arrow-line" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-line']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "arrow-char" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-char']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-item" },
        ...{ class: (__VLS_ctx.verifiedCrop.isHarvested ? 'completed' : 'pending') },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-marker" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-marker']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "marker-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['marker-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-content" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-header" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "step-badge" },
        ...{ class: (__VLS_ctx.verifiedCrop.isHarvested ? 'completed' : 'pending') },
    });
    /** @type {__VLS_StyleScopedClasses['step-badge']} */ ;
    (__VLS_ctx.verifiedCrop.isHarvested ? 'Harvest Confirmed' : 'Pending Harvest');
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "stepper-desc" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-desc']} */ ;
    if (__VLS_ctx.verifiedCrop.isHarvested) {
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.formatDate(__VLS_ctx.verifiedCrop.expectedHarvestDate));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-meta']} */ ;
    if (__VLS_ctx.verifiedCrop.isHarvested) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "meta-item" },
        });
        /** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.formatDateTime(__VLS_ctx.verifiedCrop.harvestTimestamp));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "meta-item" },
        });
        /** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.formatDate(__VLS_ctx.verifiedCrop.expectedHarvestDate));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-arrow" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-arrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "arrow-line" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-line']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "arrow-char" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-char']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-item" },
        ...{ class: (__VLS_ctx.supplierMovement ? 'completed' : 'pending') },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-marker" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-marker']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "marker-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['marker-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-content" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-header" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "step-badge" },
        ...{ class: (__VLS_ctx.supplierMovement ? 'completed' : 'pending') },
    });
    /** @type {__VLS_StyleScopedClasses['step-badge']} */ ;
    (__VLS_ctx.supplierMovement ? 'Transferred to Supplier' : 'Pending Transfer');
    if (__VLS_ctx.supplierMovement) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "movement-details-box" },
        });
        /** @type {__VLS_StyleScopedClasses['movement-details-box']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "detail-row" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-label" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
            ...{ class: "detail-addr" },
            title: (__VLS_ctx.supplierMovement.from),
        });
        /** @type {__VLS_StyleScopedClasses['detail-addr']} */ ;
        (__VLS_ctx.truncateAddress(__VLS_ctx.supplierMovement.from, 8, 6));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "detail-row" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-label" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
            ...{ class: "detail-addr" },
            title: (__VLS_ctx.supplierMovement.to),
        });
        /** @type {__VLS_StyleScopedClasses['detail-addr']} */ ;
        (__VLS_ctx.truncateAddress(__VLS_ctx.supplierMovement.to, 8, 6));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "detail-row" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-label" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-text bold" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-text']} */ ;
        /** @type {__VLS_StyleScopedClasses['bold']} */ ;
        (__VLS_ctx.supplierMovement.toRole);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "detail-row" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-label" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-text" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-text']} */ ;
        (__VLS_ctx.formatDateTime(__VLS_ctx.supplierMovement.timestamp));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "stepper-desc pending-desc" },
        });
        /** @type {__VLS_StyleScopedClasses['stepper-desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['pending-desc']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-arrow" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-arrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "arrow-line" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-line']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "arrow-char" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-char']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-item" },
        ...{ class: (__VLS_ctx.retailerMovement ? 'completed' : 'pending') },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-marker" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-marker']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "marker-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['marker-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-content" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "stepper-header" },
    });
    /** @type {__VLS_StyleScopedClasses['stepper-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "step-badge" },
        ...{ class: (__VLS_ctx.retailerMovement ? 'completed' : 'pending') },
    });
    /** @type {__VLS_StyleScopedClasses['step-badge']} */ ;
    (__VLS_ctx.retailerMovement ? 'Delivered to Retailer' : 'Pending Delivery');
    if (__VLS_ctx.retailerMovement) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "movement-details-box" },
        });
        /** @type {__VLS_StyleScopedClasses['movement-details-box']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "detail-row" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-label" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
            ...{ class: "detail-addr" },
            title: (__VLS_ctx.retailerMovement.from),
        });
        /** @type {__VLS_StyleScopedClasses['detail-addr']} */ ;
        (__VLS_ctx.truncateAddress(__VLS_ctx.retailerMovement.from, 8, 6));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "detail-row" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-label" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
            ...{ class: "detail-addr" },
            title: (__VLS_ctx.retailerMovement.to),
        });
        /** @type {__VLS_StyleScopedClasses['detail-addr']} */ ;
        (__VLS_ctx.truncateAddress(__VLS_ctx.retailerMovement.to, 8, 6));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "detail-row" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-label" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-text bold" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-text']} */ ;
        /** @type {__VLS_StyleScopedClasses['bold']} */ ;
        (__VLS_ctx.retailerMovement.toRole);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "detail-row" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-label" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "detail-text" },
        });
        /** @type {__VLS_StyleScopedClasses['detail-text']} */ ;
        (__VLS_ctx.formatDateTime(__VLS_ctx.retailerMovement.timestamp));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "stepper-desc pending-desc" },
        });
        /** @type {__VLS_StyleScopedClasses['stepper-desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['pending-desc']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "all-movements-section" },
    });
    /** @type {__VLS_StyleScopedClasses['all-movements-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel-heading movements-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-heading']} */ ;
    /** @type {__VLS_StyleScopedClasses['movements-heading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
    (__VLS_ctx.verifiedCrop.movements.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    if (__VLS_ctx.verifiedCrop.movements.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-movements" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-movements']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "empty-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
        (__VLS_ctx.truncateAddress(__VLS_ctx.verifiedCrop.farmer));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        for (const [movement, idx] of __VLS_vFor((__VLS_ctx.verifiedCrop.movements))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (idx),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "movement-idx" },
            });
            /** @type {__VLS_StyleScopedClasses['movement-idx']} */ ;
            (idx + 1);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cell-addr" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-addr']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
                title: (movement.from),
            });
            (__VLS_ctx.truncateAddress(movement.from));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            throw 0;
                        if (!!(__VLS_ctx.errorMessage))
                            throw 0;
                        if (!(__VLS_ctx.verifiedCrop))
                            throw 0;
                        if (!!(__VLS_ctx.verifiedCrop.movements.length === 0))
                            throw 0;
                        return (__VLS_ctx.copyToClipboard(movement.from));
                        // @ts-ignore
                        [truncateAddress, truncateAddress, truncateAddress, truncateAddress, truncateAddress, truncateAddress, truncateAddress, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, verifiedCrop, copyToClipboard, copiedAddress, formatDate, formatDate, formatDate, formatDateTime, formatDateTime, formatDateTime, formatDateTime, supplierMovement, supplierMovement, supplierMovement, supplierMovement, supplierMovement, supplierMovement, supplierMovement, supplierMovement, supplierMovement, supplierMovement, retailerMovement, retailerMovement, retailerMovement, retailerMovement, retailerMovement, retailerMovement, retailerMovement, retailerMovement, retailerMovement, retailerMovement,];
                    } },
                type: "button",
                ...{ class: "copy-icon-btn" },
                title: "Copy address",
            });
            /** @type {__VLS_StyleScopedClasses['copy-icon-btn']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "cell-addr" },
            });
            /** @type {__VLS_StyleScopedClasses['cell-addr']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({
                title: (movement.to),
            });
            (__VLS_ctx.truncateAddress(movement.to));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            throw 0;
                        if (!!(__VLS_ctx.errorMessage))
                            throw 0;
                        if (!(__VLS_ctx.verifiedCrop))
                            throw 0;
                        if (!!(__VLS_ctx.verifiedCrop.movements.length === 0))
                            throw 0;
                        return (__VLS_ctx.copyToClipboard(movement.to));
                        // @ts-ignore
                        [truncateAddress, copyToClipboard,];
                    } },
                type: "button",
                ...{ class: "copy-icon-btn" },
                title: "Copy address",
            });
            /** @type {__VLS_StyleScopedClasses['copy-icon-btn']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "role-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['role-badge']} */ ;
            (movement.toRole);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "datetime-text" },
            });
            /** @type {__VLS_StyleScopedClasses['datetime-text']} */ ;
            (__VLS_ctx.formatDateTime(movement.timestamp));
            // @ts-ignore
            [formatDateTime,];
        }
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
