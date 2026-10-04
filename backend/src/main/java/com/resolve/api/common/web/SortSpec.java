package com.resolve.api.common.web;

/** Campo de orden ya validado contra la lista permitida del recurso. */
public record SortSpec<F>(F field, SortDirection direction) {
}
