"use client";

import type { SelectHTMLAttributes } from "react";

// Liste déroulante d'un formulaire GET qui s'applique dès qu'on change le
// choix, sans bouton « Appliquer » : un filtre (niveau, filière...) se règle en
// un clic. Sans JavaScript, le bouton de recherche du formulaire reste utilisable.
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
