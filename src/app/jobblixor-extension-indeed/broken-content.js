}

function handleResumeSelectionPage() {
  console.log("[Jobblixor DEBUG] Checking if this is a resume selection page...");
  
  const currentUrl = window.location.href;
  if (!currentUrl.includes('resume-selection')) {
    return false;
  }
  
  console.log("[Jobblixor DEBUG] Detected resume selection page");
  
  const resumeUploaded = document.querySelector('[data-testid="resume-preview"]') ||
                        document.querySelector('.resume-preview') ||
                        document.querySelector('[data-testid*="resume"]') ||
                        document.querySelector('iframe') ||
                        Array.from(document.querySelectorAll('div')).find(div => 
                          div.textContent && div.textContent.includes('resume') && div.textContent.includes('.pdf')
                        );
  
  if (resumeUploaded) {
    console.log("[Jobblixor DEBUG] Resume already uploaded, proceeding to Continue");
    return true;
  }
  
  const uploadButtons = Array.from(document.querySelectorAll('button, div, label'))
    .filter(el => /upload.*resume|upload a resume/i.test(el.textContent || ''));
  
  if (uploadButtons.length > 0) {
    const uploadBtn = uploadButtons[0];
    uploadBtn.click();
    console.log("[Jobblixor DEBUG] Selected 'Upload a resume' option");
    return true;
  }
  
  const radioButtons = document.querySelectorAll('input[type="radio"]');
  for (const radio of radioButtons) {
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    const labelText = label ? label.textContent.toLowerCase() : '';
    
    if (labelText.includes('upload') && labelText.includes('resume')) {
      if (!radio.checked) {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Jobblixor DEBUG] Selected upload resume radio option");
        return true;
      }
    }
  }
  
  console.log("[Jobblixor DEBUG] Resume appears to be ready, no action needed");
  return true;
}

function handleDemographicFormElements(profile) {
  console.log("[Jobblixor DEBUG] Directly handling demographic form elements...");
  
  const genderRadios = document.querySelectorAll('input[type="radio"]');
  const genderValue = profile.gender || 'not declared';
  console.log(`[Jobblixor DEBUG] Looking for gender option: "${genderValue}"`);
  
  for (const radio of genderRadios) {
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    const radioText = label ? label.textContent.toLowerCase().trim() : radio.value.toLowerCase();
    
    if ((genderValue === 'male' && radioText === 'male') ||
        (genderValue === 'female' && radioText === 'female') ||
        ((genderValue === 'not declared' || !genderValue) && (radioText.includes('not declared') || radioText.includes('not disclosed')))) {
      if (!radio.checked) {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[Jobblixor DEBUG] Selected gender: ${radioText}`);
        break;
      }
    }
  }
  
  const ethnicitySelects = document.querySelectorAll('select');
  const ethnicityValue = profile.ethnicity || 'prefer not to answer';
  console.log(`[Jobblixor DEBUG] Looking for ethnicity option: "${ethnicityValue}"`);
  
  for (const select of ethnicitySelects) {
    const selectContainer = select.closest('div');
    const containerText = selectContainer ? selectContainer.textContent.toLowerCase() : '';
    
    if (containerText.includes('ethnicity') || containerText.includes('race')) {
      console.log(`[Jobblixor DEBUG] Found ethnicity dropdown with ${select.options.length} options`);
      
      for (const option of select.options) {
        const optionText = option.textContent.toLowerCase();
        
        if ((ethnicityValue.includes('prefer not') && optionText.includes('prefer not')) ||
            (ethnicityValue.includes('decline') && optionText.includes('decline')) ||
            (ethnicityValue.includes('white') && optionText.includes('white')) ||
            (ethnicityValue.includes('black') && optionText.includes('black')) ||
            (ethnicityValue.includes('asian') && optionText.includes('asian')) ||
            (ethnicityValue.includes('hispanic') && optionText.includes('hispanic'))) {
          
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] Selected ethnicity: ${option.textContent}`);
          break;
        }
      }
      break;
    }
  }
  
  const veteranValue = profile.veteran_status || 'i am not a veteran';
  console.log(`[Jobblixor DEBUG] Looking for veteran status option: "${veteranValue}"`);
  
  const allRadios = document.querySelectorAll('input[type="radio"]');
  for (const radio of allRadios) {
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    const radioText = label ? label.textContent.toLowerCase().trim() : radio.value.toLowerCase();
    
    const container = radio.closest('div, fieldset');
    const containerText = container ? container.textContent.toLowerCase() : '';
    
    if (containerText.includes('veteran status') || containerText.includes('veteran')) {
      console.log(`[Jobblixor DEBUG] Found veteran radio: "${radioText}"`);
      
      if ((veteranValue.toLowerCase().includes('not') && 
           (radioText.includes('i am not') || radioText.includes('not a veteran'))) ||
          (veteranValue.toLowerCase().includes('do not wish') && 
           radioText.includes('do not wish')) ||
          (!veteranValue.toLowerCase().includes('not') && 
           !veteranValue.toLowerCase().includes('do not') &&
           radioText.includes('veteran') && !radioText.includes('not'))) {
        
        if (!radio.checked) {
          radio.checked = true;
          radio.click();
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] Selected veteran status: ${radioText}`);
          break;
        }
      }
    }
  }
  
  const hispanicValue = profile.hispanic_latino || 'no';
  console.log(`[Jobblixor DEBUG] Looking for hispanic/latino option: "${hispanicValue}"`);
  
  for (const radio of allRadios) {
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    const radioText = label ? label.textContent.toLowerCase().trim() : radio.value.toLowerCase();
    
    const container = radio.closest('div');
    const containerText = container ? container.textContent.toLowerCase() : '';
    
    if (containerText.includes('hispanic') || containerText.includes('latino')) {
      if ((hispanicValue === 'yes' && radioText === 'yes') ||
          (hispanicValue === 'no' && radioText === 'no')) {
        if (!radio.checked) {
          radio.checked = true;
          radio.click();
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] Selected hispanic/latino: ${radioText}`);
          break;
        }
      }
    }
  }
}

function handleStandaloneCheckboxGroups() {
  console.log("[Jobblixor DEBUG] Checking for standalone checkbox groups...");
  
  const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
  
  if (allCheckboxes.length >= 3) {
    console.log(`[Jobblixor DEBUG] Found ${allCheckboxes.length} checkboxes - checking if they're availability options`);
    
    let isAvailabilityGroup = false;
    const availabilityKeywords = ['nights', 'days', 'holidays', 'weekends', 'availability', 'shifts'];
    
    for (const checkbox of allCheckboxes) {
      const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
      const labelText = label ? label.textContent.toLowerCase() : '';
      
      if (availabilityKeywords.some(keyword => labelText.includes(keyword))) {
        isAvailabilityGroup = true;
        break;
      }
    }
    
    if (isAvailabilityGroup) {
      console.log("[Jobblixor DEBUG] Detected availability checkbox group - checking all options");
      let checkedCount = 0;
      
      allCheckboxes.forEach(checkbox => {
        if (!checkbox.checked) {
          const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
          const labelText = label ? label.textContent.trim() : (checkbox.value || checkbox.id);
          
          checkbox.checked = true;
          checkbox.click();
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] Checked availability: ${labelText}`);
          checkedCount++;
        }
      });
      
      return checkedCount > 0;
    }
  }
  
  return false;
}

function handleRadioQuestion(radios, answerValue, questionText) {
  if (radios.length === 0) return false;

  console.log(`[Jobblixor DEBUG] Found ${radios.length} radio buttons for question`);

  for (const radio of radios) {
    let radioText = '';
    
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    if (label) {
      radioText = label.textContent.toLowerCase().trim();
    }
    
    if (!radioText && radio.parentElement) {
      const parentText = radio.parentElement.textContent.toLowerCase().trim();
      if (parentText.length < 20) {
        radioText = parentText;
      }
    }
    
    if (!radioText && radio.nextSibling) {
      if (radio.nextSibling.nodeType === Node.TEXT_NODE) {
        radioText = radio.nextSibling.textContent.toLowerCase().trim();
      } else if (radio.nextSibling.tagName) {
        radioText = radio.nextSibling.textContent.toLowerCase().trim();
      }
    }
    
    if (!radioText && radio.value) {
      radioText = radio.value.toLowerCase().trim();
    }

    const shouldSelect = shouldSelectRadioOption(radioText, radio.value, answerValue, questionText);
    
    if (shouldSelect) {
      if (!radio.checked) {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        
        console.log(`[Jobblixor DEBUG] Selected radio: "${radioText || radio.value}"`);
        return true;
      } else {
        console.log(`[Jobblixor DEBUG] Radio already selected: "${radioText || radio.value}"`);
        return true;
      }
    }
  }

  return false;
}

function shouldSelectRadioOption(optionText, optionValue, answerValue, questionText) {
  const answer = answerValue.toString().toLowerCase().trim();
  const text = optionText.toLowerCase().trim();
  const value = optionValue.toLowerCase().trim();

  if (answer === 'yes' || answer === 'true') {
    if (text === 'yes' || value === 'yes' || text === 'true' || value === 'true') {
      return true;
    }
  }
  
  if (answer === 'no' || answer === 'false') {
    if (text === 'no' || value === 'no' || text === 'false' || value === 'false') {
      return true;
    }
  }

  if (answer === 'male' && (text === 'male' || value === 'male')) {
    return true;
  }

  if (answer === 'female' && (text === 'female' || value === 'female')) {
    return true;
  }

  if ((answer === 'not declared' || answer === 'prefer not to answer') && 
      (text.includes('not declared') || text.includes('not disclosed') || text.includes('prefer not'))) {
    return true;
  }

  if (text === answer || value === answer) {
    return true;
  }

  if (text.includes(answer) || value.includes(answer)) {
    return true;
  }

  return false;
}

function handleSelectQuestion(selects, answerValue, questionText) {
  if (selects.length === 0) return false;

  for (const select of selects) {
    for (const option of select.options) {
      const optionText = option.textContent.toLowerCase();
      const optionValue = option.value.toLowerCase();
      
      const shouldSelect = shouldSelectSelectOption(optionText, optionValue, answerValue, questionText);
      
      if (shouldSelect) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[Jobblixor DEBUG] Selected option: "${option.textContent}"`);
        return true;
      }
    }
  }

  return false;
}

function shouldSelectSelectOption(optionText, optionValue, answerValue, questionText) {
  const answer = answerValue.toString().toLowerCase();
  const text = optionText.toLowerCase();
  const value = optionValue.toLowerCase();

  if (questionText.includes('experience') && /\d/.test(answer)) {
    const answerNum = parseInt(answer.match(/\d+/)?.[0] || '0');
    
    const rangeMatch = text.match(/(\d+)[-\s]*(?:to|-)?\s*(\d+)/);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1]);
      const max = parseInt(rangeMatch[2]);
      return answerNum >= min && answerNum <= max;
    }
    
    const singleMatch = text.match(/(\d+)/);
    if (singleMatch && parseInt(singleMatch[1]) === answerNum) {
      return true;
    }
    
    if (answerNum <= 1 && (text.includes('0-1') || text.includes('less than 2'))) return true;
    if (answerNum >= 2 && answerNum <= 3 && text.includes('2-3')) return true;
    if (answerNum >= 4 && answerNum <= 5 && text.includes('4-5')) return true;
    if (answerNum >= 6 && text.includes('6+')) return true;
  }

  if (text.includes(answer) || value.includes(answer)) {
    return true;
  }

  return false;
}

function handleCheckboxQuestion(checkboxes, answerValue, questionText) {
  if (checkboxes.length === 0) return false;

  const shouldCheck = answerValue.toString().toLowerCase() === 'yes' || 
                     answerValue.toString().toLowerCase() === 'true';

  if (shouldCheck) {
    checkboxes.forEach(checkbox => {
      if (!checkbox.checked) {
        checkbox.checked = true;
        checkbox.click();
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Jobblixor DEBUG] Checked checkbox");
      }
    });
    return true;
  }

  return false;
}

function handleUnknownQuestion(questionEl, questionText) {
  const questionContainer = questionEl.closest('div, fieldset, form') || questionEl.parentElement;
  if (!questionContainer) return false;

  if (questionText.includes('availability') || questionText.includes('work') || questionText.includes('schedule')) {
    const checkboxes = questionContainer.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      let checkedAny = false;
      checkboxes.forEach(checkbox => {
        if (!checkbox.checked) {
          checkbox.checked = true;
          checkbox.click();
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          checkedAny = true;
        }
      });
      return checkedAny;
    }
  }

  const radios = questionContainer.querySelectorAll('input[type="radio"]');
  if (radios.length > 0) {
    const attractiveOptions = [
      'both full time and part time', 'both', 'full time and part time',
      'full time', 'full-time',
      'yes', 'available', 'immediately', 'anytime',
      'flexible', 'open', 'willing'
    ];

    for (const attractiveOption of attractiveOptions) {
      for (const radio of radios) {
        const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
        let radioText = '';
        
        if (label) {
          radioText = label.textContent.toLowerCase().trim();
        } else if (radio.parentElement) {
          radioText = radio.parentElement.textContent.toLowerCase().trim();
        } else if (radio.value) {
          radioText = radio.value.toLowerCase().trim();
        }

        if (radioText.includes(attractiveOption)) {
          if (!radio.checked) {
            radio.checked = true;
            radio.click();
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[Jobblixor DEBUG] Fallback selected attractive option: "${radioText}"`);
            return true;
          }
        }
      }
    }

    if (radios[0] && !radios[0].checked) {
      radios[0].checked = true;
      radios[0].click();
      radios[0].dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[Jobblixor DEBUG] Fallback selected first radio option`);
      return true;
    }
  }

  return false;
}

async function forceCheckAvailabilityBoxes() {
  console.log("[Jobblixor DEBUG] Force-checking any remaining unchecked checkboxes...");
  
  const allCheckboxes = document.querySelectorAll('input[type="checkbox"]:not(:checked)');
  console.log(`[Jobblixor DEBUG] Found ${allCheckboxes.length} unchecked checkboxes`);
  
  let checkedCount = 0;
  
  for (const checkbox of allCheckboxes) {
    if (checkbox.offsetParent === null || checkbox.disabled) {
      continue;
    }
    
    const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
    let labelText = '';
    
    if (label) {
      labelText = label.textContent.trim();
    } else if (checkbox.parentElement) {
      const parentText = checkbox.parentElement.textContent.trim();
      if (parentText.length < 50) {
        labelText = parentText;
      }
    } else if (checkbox.value) {
      labelText = checkbox.value;
    } else if (checkbox.name) {
      labelText = checkbox.name;
    }
    
    console.log(`[Jobblixor DEBUG] Force-checking checkbox: "${labelText}"`);
    
    if (label) {
      label.click();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('click', { bubbles: true }));
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
    
    checkbox.focus();
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    checkbox.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    
    checkbox.click();
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (checkbox.checked) {
      console.log(`[Jobblixor DEBUG] Successfully checked: "${labelText}"`);
      checkedCount++;
    }
  }
  
  return checkedCount;
}

function getFieldMappings(profile) {
  return [
    { value: profile.first_name, keywords: ['first name', 'given name', 'fname', 'forename'] },
    { value: profile.last_name, keywords: ['last name', 'surname', 'lname', 'family name'] },
    { value: profile.email, keywords: ['email', 'e-mail'] },
    { value: profile.phone_number, keywords: ['phone', 'mobile', 'cell'] },
    { value: profile.location, keywords: ['location', 'city', 'locality', 'town'] },
    { value: profile.preferred_salary, keywords: ['salary', 'expected pay', 'pay'] },
    { value: profile.zip_code, keywords: ['zip', 'postal', 'postcode', 'zip/postal'] },
    { value: profile.street_address, keywords: ['address', 'address line', 'street', 'street address', 'address 1', 'address line 1'] }
  ];
}

function robustFillFieldFixed(keywords, value) {
  let filled = false;
  
  if (keywords.some(kw => kw.includes('phone'))) {
    console.log(`[Jobblixor DEBUG] FIXED: Looking for phone number field with value: "${value}"`);
    
    const phoneInputs = document.querySelectorAll('input[type="tel"], input[name*="phone"], input[id*="phone"], input[placeholder*="phone"]');
    
    for (const phoneInput of phoneInputs) {
      if (phoneInput.type === 'tel' || 
          phoneInput.name?.toLowerCase().includes('phone') ||
          phoneInput.id?.toLowerCase().includes('phone') ||
          phoneInput.placeholder?.toLowerCase().includes('phone')) {
        
        const cleanPhone = value.replace(/\D/g, '');
        
        console.log(`[Jobblixor DEBUG] FIXED: Attempting to fill phone with: "${cleanPhone}"`);
        
        setNativeValueSingle(phoneInput, cleanPhone);
        filled = true;
        
        setTimeout(() => {
          console.log(`[Jobblixor DEBUG] FIXED: Phone field value after fill: "${phoneInput.value}"`);
          if (phoneInput.value === cleanPhone) {
            console.log(`[Jobblixor DEBUG] FIXED: Phone number successfully filled and verified`);
          } else {
            console.log(`[Jobblixor DEBUG] FIXED: Phone number may not have stuck properly`);
            phoneInput.value = cleanPhone;
            phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
            phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 500);
        
        break;
      }
    }
  }
  
  if (!filled) {
    document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input:not([type]), textarea, select').forEach(input => {
      const allAttrs = [
        input.labels?.[0]?.innerText?.toLowerCase() || "",
        input.placeholder?.toLowerCase() || "",
        input.name?.toLowerCase() || "",
        input.id?.toLowerCase() || "",
        input.getAttribute("data-testid")?.toLowerCase() || "",
        input.getAttribute("aria-label")?.toLowerCase() || ""
      ];
      if (keywords.some(kw => allAttrs.some(attr => attr.includes(kw)))) {
        setNativeValueSingle(input, value);
        filled = true;
        console.log(`[Jobblixor DEBUG] FIXED: Filled "${keywords.join('/')}" with "${value}"`);
      }
    });
  }
  
  if (!filled) {
    document.querySelectorAll('input[type="radio"], select').forEach(el => {
      const allAttrs = [
        el.labels?.[0]?.innerText?.toLowerCase() || "",
        el.name?.toLowerCase() || "",
        el.id?.toLowerCase() || "",
        el.getAttribute("data-testid")?.toLowerCase() || "",
        el.getAttribute("aria-label")?.toLowerCase() || ""
      ];
      if (keywords.some(kw => allAttrs.some(attr => attr.includes(kw)))) {
        if (el.type === "radio") {
          if (el.value?.toLowerCase() === value?.toLowerCase() || allAttrs.some(attr => attr.includes(value?.toLowerCase()))) {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled = true;
            console.log(`[Jobblixor DEBUG] FIXED: Checked radio "${keywords.join('/')}" as "${value}"`);
          }
        }
        if (el.tagName === "SELECT") {
          for (const option of el.options) {
            if (option.text.toLowerCase().includes(value.toLowerCase())) {
              el.value = option.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              filled = true;
              console.log(`[Jobblixor DEBUG] FIXED: Selected option "${keywords.join('/')}" as "${value}"`);
              break;
            }
          }
        }
      }
    });
  }
  return filled;
}

function setNativeValueSingle(element, value) {
  console.log(`[Jobblixor DEBUG] FIXED: Setting value "${value}" on element type: ${element.type || element.tagName}`);
  
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  
  element.focus();
  
  if (element.tagName === 'INPUT' && nativeInputValueSetter) {
    nativeInputValueSetter.call(element, '');
    nativeInputValueSetter.call(element, value);
  } else if (element.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
    nativeTextAreaValueSetter.call(element, '');
    nativeTextAreaValueSetter.call(element, value);
  } else {
    element.value = value;
  }
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
  
  console.log(`[Jobblixor DEBUG] FIXED: Element value set to: "${element.value}"`);
}

function fillAllCheckboxes() {
  console.log('[Jobblixor DEBUG] Checking for agreement/terms checkboxes...');
  
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    if (!checkbox.checked) {
      const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
      const parent = checkbox.parentElement;
      
      let checkboxContext = '';
      if (label) {
        checkboxContext = label.textContent.toLowerCase();
      } else if (parent) {
        checkboxContext = parent.textContent.toLowerCase();
      }
      
      if (checkboxContext.includes('terms') || 
          checkboxContext.includes('conditions') || 
          checkboxContext.includes('agree') || 
          checkboxContext.includes('consent') || 
          checkboxContext.includes('share') || 
          checkboxContext.includes('policy') ||
          checkboxContext.includes('understand')) {
        
        checkbox.checked = true;
        if (label) {
          label.click();
        }
        checkbox.click();
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        
        console.log('[Jobblixor DEBUG] Checked agreement/terms checkbox');
      }
    }
  });
}

async function uploadResumeFromFirebase(resumeUrl) {
  try {
    selectUploadResumeOption();
    
    await new Promise(r => setTimeout(r, 500));

    const waitForInput = async () => {
      for (let i = 0; i < 12; i++) {
        const inp = document.querySelector('input[type="file"]');
        if (inp) return inp;
        await new Promise(r => setTimeout(r, 250));
      }
      return null;
    };
    const fileInput = await waitForInput();
    if (!fileInput) {
      console.log('[Jobblixor DEBUG] No file input found for resume upload');
      return { uploaded: false, clickedContinue: false };
    }
    if (fileInput.files && fileInput.files.length > 0) {
      console.log('[Jobblixor DEBUG] File input already has a file');
      return { uploaded: true, clickedContinue: false };
    }

    const resp = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'FETCH_RESUME_FILE', resumeUrl }, resolve);
    });
    if (!resp || !resp.success) {
      console.error('[Jobblixor DEBUG] Resume fetch failed:', resp?.error);
      return { uploaded: false, clickedContinue: false };
    }

    const base64 = resp.base64;
    const mimeType = resp.mimeType || 'application/pdf';
    const filename = resp.filename || 'resume.pdf';

    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const file = new File([bytes], filename, { type: mimeType });

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;

    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('[Jobblixor DEBUG] Resume uploaded!');

    await new Promise(r => setTimeout(r, 500));
    selectPostUploadResumeOptions();

    await new Promise(r => setTimeout(r, 1000));
    
    const continueBtn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
      .find(b => /continue|next|submit/i.test(b.innerText || b.value));
    
    if (continueBtn) {
      console.log('[Jobblixor DEBUG] Found Continue button, waiting for it to be enabled...');
      const enabled = await waitForEnabled(continueBtn, 10000);
      
      if (enabled) {
        const now = Date.now();
        if (!continueBtn._lastClicked || now - continueBtn._lastClicked > 2000) {
          continueBtn._lastClicked = now;
          continueBtn.click();
          console.log('[Jobblixor DEBUG] Clicked Continue button after resume upload');
          return { uploaded: true, clickedContinue: true };
        } else {
          console.log('[Jobblixor DEBUG] Continue button was recently clicked, skipping');
          return { uploaded: true, clickedContinue: true };
        }
      } else {
        console.log('[Jobblixor DEBUG] Continue button did not become enabled, may need manual intervention');
        return { uploaded: true, clickedContinue: false };
      }
    } else {
      console.log('[Jobblixor DEBUG] No Continue button found after resume upload');
      return { uploaded: true, clickedContinue: false };
    }
  } catch (e) {
    console.error('[Jobblixor DEBUG] Resume upload failed:', e);
    return { uploaded: false, clickedContinue: false };
  }
}

function selectUploadResumeOption() {
  const uploadElements = Array.from(document.querySelectorAll('button, label, div, span, input'))
    .filter(el => /upload.*resume|upload a resume/i.test(el.textContent || el.value || el.getAttribute('aria-label') || ''));

  for (const el of uploadElements) {
    if (el.type === 'radio') {
      if (!el.checked) {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Jobblixor DEBUG] Selected upload resume radio option');
        return true;
      }
    } else if (el.tagName === 'LABEL') {
      const radio = el.querySelector('input[type="radio"]') || 
                   (el.getAttribute('for') && document.getElementById(el.getAttribute('for')));
      if (radio && radio.type === 'radio') {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Jobblixor DEBUG] Selected upload resume radio via label');
        return true;
      } else {
        el.click();
        console.log('[Jobblixor DEBUG] Clicked upload resume label/button');
        return true;
      }
    } else {
      el.click();
      console.log('[Jobblixor DEBUG] Clicked upload resume element:', el.tagName);
      return true;
    }
  }
  
  return false;
}

function selectPostUploadResumeOptions() {
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
    .filter(radio => !radio.checked);
  
  if (radios.length > 0) {
    const firstRadio = radios[0];
    firstRadio.checked = true;
    firstRadio.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[Jobblixor DEBUG] Selected post-upload resume option:', firstRadio.value || firstRadio.id);
    return true;
  }
  
  return false;
}

async function waitForEnabled(element, timeoutMs = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (!element.disabled && element.getAttribute('aria-disabled') !== 'true') {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return false;
}

function detectAnyFillableInputs() {
  const fillableInputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="number"], textarea, select, input[type="radio"], input[type="checkbox"]'
  );
  console.log("[Jobblixor DEBUG] Fillable inputs detected:", fillableInputs.length);
  return fillableInputs.length > 0;
}

function logProgress(email, message) {
  if (!email) return;
  chrome.runtime.sendMessage({
    type: "LOG_PROGRESS_UPDATE",
    email,
    message,
    timestamp: Date.now()
  }, (response) => {
    if (!response?.success) {
      console.error("[Jobblixor DEBUG] Failed to log progress:", response?.error);
    }
  });
}

// ==========================================
// UNIFIED MESSAGE HANDLER
// ==========================================

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log("[Jobblixor DEBUG] onMessage received:", message.type, message);
  
  try {
    if (message.type === "START_AUTO_APPLY") {
      console.log("[Jobblixor DEBUG] ===== PHASE 2 MODE ACTIVATED =====");
      
      stopContinuousMonitoring();
      isRunning = false;
      isPaused = false;

      const userProfile = {
        job_title: message.jobTitle || "software engineer",
        location: message.location || "New York, NY", 
        targetJobs: message.jobCount || 10,
        email: message.email
      };

      console.log("[Phase 2] User Profile:", userProfile);

      clearAutomationState();

      setTimeout(async () => {
        try {
          const result = await runPhase2Automation(userProfile);
          console.log("[Phase 2] Automation completed with result:", result);
        } catch (error) {
          console.error("[Phase 2] Automation failed:", error);
          sendStatusUpdate(`Phase 2 Error: ${error.message}`);
          clearAutomationState();
        }
      }, 1000);

      sendResponse({ success: true, message: "Phase 2 automation started" });
      return true;

    } else if (message.type === "RUN_PHASE1_AUTOFILL" && message.email) {
      console.log("[Jobblixor DEBUG] ===== PHASE 1 MODE ACTIVATED =====");
      console.log("[Phase 1] Running autofill for Easy Apply form");
      
      if (!window.location.hostname.includes('smartapply.indeed.com')) {
        console.log("[Phase 1] WARNING: Not on Easy Apply page, skipping autofill");
        sendResponse({ success: false, error: "Not on Easy Apply page" });
        return true;
      }
      
      targetJobCount = message.jobCount || 1;
      currentJobCount = 0;
      processedPages.clear();
      
      startContinuousMonitoring(message.email);
      
      isRunning = true;
      isPaused = false;
      
      processedPages.add(window.location.href);
      
      await startJobblixorBot(message.email);
      isRunning = false;
      
      sendResponse({ success: true });
      console.log("[Jobblixor DEBUG] Phase 1 autofill completed");
      
    } else if (message.type === "STOP_AUTO_APPLY") {
      console.log("[Jobblixor DEBUG] STOP_AUTO_APPLY received");
      
      isRunning = false;
      isPaused = false;
      allowPageReloads();
      stopContinuousMonitoring();
      clearAutomationState();
      
      sendResponse({ success: true });

    } else {
      console.warn("[Jobblixor DEBUG] Received unknown message:", message);
      sendResponse({ success: false, error: "Unknown message type" });
    }
    
  } catch (err) {
    console.error("[Jobblixor DEBUG] Bot error:", err);
    allowPageReloads();
    clearAutomationState();
    sendResponse({ success: false, error: err?.toString() });
  }
  
  return true;
});

// ==========================================
// INITIALIZATION AND AUTO-RESUME LOGIC
// ==========================================

if (window.location.hostname === 'smartapply.indeed.com' || 
    window.location.hostname === 'us.smartapply.indeed.com') {
  console.log("[Jobblixor] Detected Easy Apply page");
  
  setTimeout(() => {
    if (autoStartEmail) {
      startJobblixorBot(autoStartEmail);
    }
  }, 3000);
}

console.log('[State] Content script initializing, checking for automation state...');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkAndResumeAutomation, 1000);
  });
} else {
  setTimeout(checkAndResumeAutomation, 1000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    console.log('[State] Page became visible, checking for automation state...');
    setTimeout(checkAndResumeAutomation, 500);
  }
});

console.log("[Jobblixor] Content script fully loaded with button-based detection");

})();(() => {
// ==========================================
// SMART NAVIGATION CONTROL
// ==========================================

let extensionRunning = false;
let automationInProgress = false;
let navigationPromises = new Map();

async function safeAutomationAction(actionName, actionFn, waitForLoad = true) {
  console.log(`[Automation] STARTING: ${actionName}`);
  automationInProgress = true;
  
  try {
    const result = await actionFn();
    
    if (waitForLoad) {
      await waitForNavigationComplete(actionName);
    }
    
    return result;
  } catch (error) {
    console.error(`[Automation] ERROR in ${actionName}:`, error);
    throw error;
  } finally {
    setTimeout(() => {
      automationInProgress = false;
      console.log(`[Automation] COMPLETED: ${actionName} - protection re-enabled`);
    }, 1000);
  }
}

async function waitForNavigationComplete(actionName, maxWaitMs = 8000) {
  console.log(`[Automation] Waiting for ${actionName} navigation to complete...`);
  
  const startTime = Date.now();
  let lastUrl = window.location.href;
  let stabilityCount = 0;
  const requiredStability = 3;
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const currentTime = Date.now();
      const currentUrl = window.location.href;
      
      if (currentUrl !== lastUrl) {
        console.log(`[Automation] URL changed during ${actionName}: ${lastUrl} -> ${currentUrl}`);
        lastUrl = currentUrl;
        stabilityCount = 0;
        return;
      }
      
      const isLoading = document.querySelector('.loading, .spinner, [data-testid*="loading"]') ||
                       document.readyState !== 'complete' ||
                       window.location.href.includes('#loading');
      
      if (isLoading) {
        console.log(`[Automation] Still loading during ${actionName}...`);
        stabilityCount = 0;
        return;
      }
      
      const indeedLoading = document.querySelector('[data-testid*="skeleton"]') ||
                           document.querySelector('.jobsearch-ViewjobPaneWrapper[style*="opacity"]') ||
                           document.querySelector('.jobsearch-JobComponent[aria-busy="true"]');
      
      if (indeedLoading) {
        console.log(`[Automation] Indeed-specific loading detected during ${actionName}...`);
        stabilityCount = 0;
        return;
      }
      
      stabilityCount++;
      
      if (stabilityCount >= requiredStability || currentTime - startTime > maxWaitMs) {
        clearInterval(checkInterval);
        console.log(`[Automation] Navigation complete for ${actionName} (${currentTime - startTime}ms, stability: ${stabilityCount})`);
        resolve();
      }
    }, 500);
  });
}

function preventPageReloads() {
  console.log("[Protection] Installing page reload protection");
  
  window.addEventListener('beforeunload', (event) => {
    if (extensionRunning && !automationInProgress) {
      event.preventDefault();
      event.returnValue = 'Jobblixor is running. Are you sure you want to leave?';
      console.log("[Protection] Blocked page reload - extension is running");
      return 'Jobblixor is running. Are you sure you want to leave?';
    }
  });
  
  extensionRunning = true;
}

function allowPageReloads() {
  console.log("[Protection] Disabling page reload protection");
  extensionRunning = false;
  automationInProgress = false;
}

// ==========================================
// STATE PERSISTENCE SYSTEM
// ==========================================

const STATE_STORAGE_KEY = 'jobblixor_automation_state';

function saveAutomationState(state) {
  try {
    const stateData = {
      ...state,
      timestamp: Date.now(),
      url: window.location.href
    };
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(stateData));
    console.log('[State] Automation state saved:', stateData);
  } catch (error) {
    console.error('[State] Error saving automation state:', error);
  }
}

function loadAutomationState() {
  try {
    const stateJson = localStorage.getItem(STATE_STORAGE_KEY);
    if (!stateJson) {
      console.log('[State] No automation state found');
      return null;
    }
    
    const state = JSON.parse(stateJson);
    console.log('[State] Automation state loaded:', state);
    
    const maxAge = 30 * 60 * 1000; // 30 minutes
    if (Date.now() - state.timestamp > maxAge) {
      console.log('[State] Automation state is too old, clearing...');
      clearAutomationState();
      return null;
    }
    
    return state;
  } catch (error) {
    console.error('[State] Error loading automation state:', error);
    clearAutomationState();
    return null;
  }
}

function clearAutomationState() {
  try {
    localStorage.removeItem(STATE_STORAGE_KEY);
    console.log('[State] Automation state cleared');
  } catch (error) {
    console.error('[State] Error clearing automation state:', error);
  }
}

function shouldResumeAutomation() {
  const state = loadAutomationState();
  if (!state) return null;
  
  const currentUrl = window.location.href;
  
  if (!currentUrl.includes('indeed.com') || 
      currentUrl.includes('smartapply.indeed.com')) {
    console.log('[State] Not on Indeed search results page, not resuming');
    return null;
  }
  
  const isResultsPage = currentUrl.includes('/jobs?') ||
                       currentUrl.includes('q=') ||
                       document.querySelector('.jobsearch-ResultsList, [data-testid="searchResults"], [data-jk]');
  
  if (!isResultsPage) {
    console.log('[State] Not on search results page, not resuming');
    return null;
  }
  
  console.log('[State] Should resume automation with state:', state);
  return state;
}

// ==========================================
// PHASE 2: BULLETPROOF BUTTON-BASED AUTOMATION
// ==========================================

function sendStatusUpdate(message) {
  chrome.runtime.sendMessage({
    type: "STATUS_UPDATE",
    message: message
  }).catch(() => {
    // Ignore if popup is closed
  });
  console.log(`[Phase 2] STATUS: ${message}`);
}

async function performRobustJobSearch(userProfile) {
  console.log("[Phase 2] ===== STEP 1: PERFORMING JOB SEARCH =====");
  sendStatusUpdate(`🔍 Searching for "${userProfile.job_title}" in "${userProfile.location}"...`);
  
  const automationState = {
    phase: "results",
    userProfile: userProfile,
    step: "waiting_for_results",
    jobTitle: userProfile.job_title,
    location: userProfile.location,
    targetJobs: userProfile.targetJobs,
    email: userProfile.email,
    processedCount: 0,
    errorCount: 0,
    currentJobIndex: 0
  };
  
  console.log('[State] Saving automation state before search...');
  saveAutomationState(automationState);
  
  return safeAutomationAction("Job Search", async () => {
    await waitForPageLoad();
    
    const searchInputs = findSearchInputs();
    
    if (!searchInputs.jobInput || !searchInputs.locationInput) {
      throw new Error("Could not find search form. Make sure you're on Indeed.com main page.");
    }
    
    console.log("[Phase 2] Found search inputs - job:", searchInputs.jobInput.tagName, "location:", searchInputs.locationInput.tagName);
    
    await fillInputMethod(searchInputs.jobInput, userProfile.job_title, "job title");
    await fillInputMethod(searchInputs.locationInput, userProfile.location, "location");
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const searchButton = findSearchButton();
    
    if (!searchButton) {
      throw new Error("Could not find search button");
    }
    
    console.log("[Phase 2] Clicking search button:", searchButton.textContent?.trim());
    console.log('[State] About to click search - page will reload and automation will resume...');
    searchButton.click();
    
    return { success: true, action: "search_performed" };
  }, true);
}

async function fillInputMethod(input, value, fieldName) {
  console.log(`[Phase 2] Filling ${fieldName} with: "${value}"`);
  
  input.focus();
  input.select();
  document.execCommand('delete');
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeInputValueSetter.call(input, value);
  
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`[Phase 2] ${fieldName} final value: "${input.value}"`);
  
  if (input.value !== value) {
    console.warn(`[Phase 2] ${fieldName} value mismatch! Expected: "${value}", Got: "${input.value}"`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function findSearchInputs() {
  const jobSelectors = [
    'input[name="q"]',
    'input[id*="text-input-what"]', 
    '[data-testid*="what-where-what"]',
    '#text-input-what',
    'input[aria-label*="What"]',
    'input[placeholder*="Job title"]',
    'input[placeholder*="job"]'
  ];
  
  const locationSelectors = [
    'input[name="l"]',
    'input[id*="text-input-where"]',
    '[data-testid*="what-where-where"]', 
    '#text-input-where',
    'input[aria-label*="Where"]',
    'input[placeholder*="City"]',
    'input[placeholder*="location"]'
  ];
  
  let jobInput = null;
  let locationInput = null;
  
  for (const selector of jobSelectors) {
    jobInput = document.querySelector(selector);
    if (jobInput) break;
  }
  
  for (const selector of locationSelectors) {
    locationInput = document.querySelector(selector);
    if (locationInput) break;
  }
  
  return { jobInput, locationInput };
}

function findSearchButton() {
  const buttonSelectors = [
    'button[type="submit"]',
    '.yosegi-InlineWhatWhere-primaryButton',
    'button[data-testid*="search"]',
    'button[aria-label*="Search"]'
  ];
  
  for (const selector of buttonSelectors) {
    const button = document.querySelector(selector);
    if (button) return button;
  }
  
  const allButtons = Array.from(document.querySelectorAll('button'));
  return allButtons.find(btn => {
    const text = btn.textContent?.toLowerCase().trim();
    return text === 'search' || text === 'find jobs';
  });
}

async function waitForPageLoad(maxWait = 10000) {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkLoad = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      const isLoaded = document.readyState === 'complete' &&
                      !document.querySelector('.loading, .spinner') &&
                      document.body &&
                      document.body.children.length > 0;
      
      if (isLoaded || elapsed >= maxWait) {
        clearInterval(checkLoad);
        console.log(`[Phase 2] Page load complete (${elapsed}ms)`);
        resolve();
      }
    }, 200);
  });
}

async function waitForSearchResults(maxWait = 15000) {
  console.log("[Phase 2] ===== STEP 2: WAITING FOR SEARCH RESULTS =====");
  sendStatusUpdate("⏳ Waiting for search results to load...");
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkResults = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      const hasJobCards = document.querySelectorAll('[data-jk]').length > 0;
      const hasResultsList = document.querySelector('.jobsearch-ResultsList, [data-testid="searchResults"]');
      const hasJobBeacons = document.querySelector('.job_seen_beacon');
      const noLoadingIndicators = !document.querySelector('.loading, .spinner, [data-testid*="loading"]');
      
      const resultsReady = (hasJobCards || hasResultsList || hasJobBeacons) && noLoadingIndicators;
      
      console.log(`[Phase 2] Results check (${elapsed}ms): jobCards=${document.querySelectorAll('[data-jk]').length}, loaded=${noLoadingIndicators}`);
      
      if (resultsReady || elapsed >= maxWait) {
        clearInterval(checkResults);
        console.log(`[Phase 2] Search results ready (${elapsed}ms)`);
        
        const currentState = loadAutomationState();
        if (currentState) {
          currentState.step = "results_ready";
          saveAutomationState(currentState);
        }
        
        resolve(resultsReady);
      }
    }, 1000);
  });
}

function findAllJobCards() {
  console.log("[Phase 2] ===== STEP 3: FINDING ALL JOB CARDS =====");
  
  const jobCardSelectors = [
    '[data-jk]',
    '.job_seen_beacon',
    '.slider_container .slider_item', 
    '[data-testid*="job"]',
    '.jobsearch-SerpJobCard',
    '.result',
    '[role="listitem"]'
  ];
  
  let jobCards = [];
  for (const selector of jobCardSelectors) {
    jobCards = document.querySelectorAll(selector);
    if (jobCards.length > 0) {
      console.log(`[Phase 2] Found ${jobCards.length} job cards using selector: ${selector}`);
      break;
    }
  }
  
  if (jobCards.length === 0) {
    console.log("[Phase 2] No job cards found on page");
    return [];
  }
  
  const allJobs = [];
  jobCards.forEach((jobCard, index) => {
    const jobDetails = extractJobDetails(jobCard, index);
    allJobs.push(jobDetails);
    console.log(`[Phase 2] Found job card ${index + 1}: ${jobDetails.title} at ${jobDetails.company}`);
  });
  
  console.log(`[Phase 2] Total job cards found: ${allJobs.length}`);
  return allJobs;
}

function extractJobDetails(jobCard, index) {
  const titleSelectors = [
    'h2 a[data-jk]',
    'h2 a',
    '[data-testid*="job-title"] a',
    'a[data-jk]',
    '.jobTitle a',
    'h2 span[title]',
    '.jobTitle',
    'span[title]'
  ];
  
  const companySelectors = [
    '[data-testid="company-name"]',
    '.companyName',
    'span[data-testid*="company"]',
    'a[data-testid*="company"]',
    'span[title]'
  ];
  
  let titleElement = null;
  let companyElement = null;
  
  console.log(`[Phase 2] Extracting details from job card ${index + 1} HTML:`, jobCard.outerHTML.substring(0, 300));
  
  for (const selector of titleSelectors) {
    titleElement = jobCard.querySelector(selector);
    if (titleElement && titleElement.textContent?.trim()) {
      console.log(`[Phase 2] Found title using selector "${selector}": "${titleElement.textContent.trim()}"`);
      break;
    }
  }
  
  if (!titleElement) {
    const titleFromAttribute = jobCard.querySelector('span[title]');
    if (titleFromAttribute && titleFromAttribute.getAttribute('title')) {
      titleElement = titleFromAttribute;
      console.log(`[Phase 2] Found title from title attribute: "${titleFromAttribute.getAttribute('title')}"`);
    }
  }
  
  for (const selector of companySelectors) {
    companyElement = jobCard.querySelector(selector);
    if (companyElement && companyElement.textContent?.trim()) {
      console.log(`[Phase 2] Found company using selector "${selector}": "${companyElement.textContent.trim()}"`);
      break;
    }
  }
  
  let title = 'Job ' + (index + 1);
  let company = 'Company';
  
  if (titleElement) {
    title = titleElement.textContent?.trim() || titleElement.getAttribute('title')?.trim() || title;
  }
  
  if (companyElement) {
    company = companyElement.textContent?.trim() || company;
  }
  
  console.log(`[Phase 2] Final extracted details for job ${index + 1}: "${title}" at "${company}"`);
  
  return {
    element: jobCard,
    title: title,
    company: company,
    titleLink: titleElement?.href,
    index: index
  };
}

async function clickJobCardRobustly(job, processedCount) {
  console.log(`[Phase 2] ===== STEP 4: CLICKING JOB CARD: ${job.title} =====`);
  sendStatusUpdate(`🖱️ Opening job details for: ${job.title}`);
  
  const currentState = loadAutomationState();
  if (currentState) {
    currentState.step = "clicking_job_card";
    currentState.currentJob = {
      title: job.title,
      company: job.company,
      index: job.index
    };
    currentState.processedCount = processedCount;
    currentState.currentJobIndex = job.index;
    saveAutomationState(currentState);
  }
  
  return safeAutomationAction(`Click Job Card: ${job.title}`, async () => {
    job.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    let clickSuccessful = false;
    
    if (job.titleLink) {
      const titleLink = job.element.querySelector('a[href]');
      if (titleLink) {
        console.log("[Phase 2] Method 1: Clicking title link");
        titleLink.click();
        clickSuccessful = true;
      }
    }
    
    if (!clickSuccessful) {
      const titleElement = job.element.querySelector('h2 a, [data-testid*="job-title"] a, a[data-jk], .jobTitle a');
      if (titleElement) {
        console.log("[Phase 2] Method 2: Clicking title element");
        titleElement.click();
        clickSuccessful = true;
      }
    }
    
    if (!clickSuccessful) {
      console.log("[Phase 2] Method 3: Clicking job card element");
      job.element.click();
      clickSuccessful = true;
    }
    
    if (!clickSuccessful) {
      throw new Error("Could not click job card");
    }
    
    console.log(`[Phase 2] Successfully clicked job card: ${job.title}`);
    return { success: true, action: "job_card_clicked" };
  }, false);
}

async function waitForJobDetailsPanel(maxWait = 10000) {
  console.log("[Phase 2] ===== STEP 5: WAITING FOR JOB DETAILS PANEL =====");
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkPanel = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      const detailsPanel = document.querySelector(
        '.jobsearch-ViewjobPaneWrapper, ' +
        '.jobsearch-JobComponent, ' +
        '[data-testid*="jobDetails"], ' +
        '.jobsearch-JobInfoHeader, ' +
        '#jobDetailsContainer, ' +
        '.jobsearch-JobComponentHeader'
      );
      
      const hasButtons = document.querySelector(
        'button[data-testid*="apply"], ' +
        'button[aria-label*="Apply"], ' +
        'a[data-testid*="apply"], ' +
        '.jobsearch-IndeedApplyButton, ' +
        'button, a'
      );
      
      const hasJobDescription = document.querySelector('.jobsearch-jobDescriptionText, .jobDescriptionText, [data-testid*="jobDescription"]');
      
      const panelReady = (detailsPanel && (hasButtons || hasJobDescription));
      
      console.log(`[Phase 2] Panel check (${elapsed}ms): panel=${!!detailsPanel}, buttons=${!!hasButtons}, description=${!!hasJobDescription}`);
      
      if (panelReady || elapsed >= maxWait) {
        clearInterval(checkPanel);
        console.log(`[Phase 2] Job details panel ready (${elapsed}ms)`);
        resolve(panelReady);
      }
    }, 500);
  });
}

async function checkIfEasyApplyByButton() {
  console.log("[Phase 2] ===== STEP 6: CHECKING IF EASY APPLY BY BUTTON TEXT =====");
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const primaryButton = findPrimaryActionButton();
  
  if (!primaryButton) {
    console.log("[Phase 2] BUTTON CHECK: No primary button found, assuming not Easy Apply");
    return { isEasyApply: false, reason: "no_button_found" };
  }
  
  const buttonText = primaryButton.textContent?.trim().toLowerCase() || '';
  const ariaLabel = primaryButton.getAttribute('aria-label')?.toLowerCase() || '';
  const allButtonText = (buttonText + ' ' + ariaLabel).trim();
  
  console.log(`[Phase 2] BUTTON CHECK: Found primary button with text: "${buttonText}", aria-label: "${ariaLabel}"`);
  console.log(`[Phase 2] BUTTON CHECK: Combined text for analysis: "${allButtonText}"`);
  
  const isEasyApplyButton = allButtonText.includes('apply now') || 
                           allButtonText.includes('easily apply') ||
                           (allButtonText.includes('apply') && !allButtonText.includes('company site'));
  
  const isCompanySiteButton = allButtonText.includes('apply on company site') ||
                             allButtonText.includes('company site') ||
                             allButtonText.includes('external');
  
  if (isEasyApplyButton && !isCompanySiteButton) {
    console.log(`[Phase 2] BUTTON CHECK: ✅ THIS IS EASY APPLY - Button says: "${buttonText}"`);
    return { 
      isEasyApply: true, 
      button: primaryButton, 
      buttonText: buttonText,
      reason: "apply_now_button_found" 
    };
  } else if (isCompanySiteButton) {
    console.log(`[Phase 2] BUTTON CHECK: ❌ NOT EASY APPLY - Button says: "${buttonText}" (company site)`);
    return { 
      isEasyApply: false, 
      button: primaryButton, 
      buttonText: buttonText,
      reason: "company_site_button" 
    };
  } else {
    console.log(`[Phase 2] BUTTON CHECK: ❓ UNCLEAR - Button says: "${buttonText}" (treating as not Easy Apply)`);
    return { 
      isEasyApply: false, 
      button: primaryButton, 
      buttonText: buttonText,
      reason: "unclear_button_text" 
    };
  }
}

function findPrimaryActionButton() {
  console.log("[Phase 2] BUTTON FINDER: Searching for primary action button...");
  
  const primaryButtonSelectors = [
    'button[data-testid*="apply"]',
    'a[data-testid*="apply"]',
    '.jobsearch-IndeedApplyButton button',
    '.jobsearch-IndeedApplyButton a',
    '.jobsearch-IndeedApplyButton-newDesign button',
    '.jobsearch-IndeedApplyButton-newDesign a',
    '.jobsearch-ApplyButtonContainer button',
    '.jobsearch-ApplyButtonContainer a',
    'button[aria-label*="Apply"]',
    'a[aria-label*="Apply"]',
    'button[aria-label*="apply"]',
    'a[aria-label*="apply"]'
  ];
  
  for (const selector of primaryButtonSelectors) {
    const button = document.querySelector(selector);
    if (button && button.offsetParent !== null) {
      console.log(`[Phase 2] BUTTON FINDER: Found button with selector: ${selector}`);
      return button;
    }
  }
  
  const jobDetailsPanel = document.querySelector(
    '.jobsearch-ViewjobPaneWrapper, .jobsearch-JobComponent, [data-testid*="jobDetails"]'
  );
  
  if (jobDetailsPanel) {
    console.log("[Phase 2] BUTTON FINDER: Searching within job details panel...");
    
    const allButtons = Array.from(jobDetailsPanel.querySelectorAll('button, a'))
      .filter(btn => btn.offsetParent !== null);
    
    console.log(`[Phase 2] BUTTON FINDER: Found ${allButtons.length} visible buttons/links in panel`);
    
    for (const button of allButtons) {
      const buttonText = button.textContent?.toLowerCase().trim() || '';
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
      
      console.log(`[Phase 2] BUTTON FINDER: Checking button - text: "${buttonText}", aria: "${ariaLabel}"`);
      
      if (buttonText.includes('apply') || ariaLabel.includes('apply')) {
        console.log(`[Phase 2] BUTTON FINDER: Found apply button in panel: "${buttonText}"`);
        return button;
      }
    }
  }
  
  console.log("[Phase 2] BUTTON FINDER: Final fallback - looking for prominent buttons...");
  const allPageButtons = Array.from(document.querySelectorAll('button, a'))
    .filter(btn => btn.offsetParent !== null)
    .sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return (bRect.width * bRect.height) - (aRect.width * aRect.height);
    });
  
  for (const button of allPageButtons.slice(0, 5)) {
    const buttonText = button.textContent?.toLowerCase().trim() || '';
    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
    
    if ((buttonText.includes('apply') || ariaLabel.includes('apply')) && 
        buttonText.length < 50) {
      console.log(`[Phase 2] BUTTON FINDER: Found fallback apply button: "${buttonText}"`);
      return button;
    }
  }
  
  console.log("[Phase 2] BUTTON FINDER: No primary action button found");
  return null;
}

async function clickApplyNowButton(buttonInfo) {
  console.log("[Phase 2] ===== STEP 7: CLICKING APPLY NOW BUTTON =====");
  sendStatusUpdate(`🚀 Clicking Apply Now button...`);
  
  const currentState = loadAutomationState();
  if (currentState) {
    currentState.step = "clicking_apply_now";
    saveAutomationState(currentState);
  }
  
  return safeAutomationAction("Click Apply Now", async () => {
    const applyButton = buttonInfo.button;
    
    if (applyButton.disabled || applyButton.getAttribute('aria-disabled') === 'true') {
      console.log("[Phase 2] Apply button is disabled, waiting a moment...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (applyButton.disabled || applyButton.getAttribute('aria-disabled') === 'true') {
        throw new Error("Apply Now button is disabled");
      }
    }
    
    console.log(`[Phase 2] Clicking Apply Now button: "${buttonInfo.buttonText}"`);
    
    if (applyButton.href && applyButton.tagName.toLowerCase() === 'a') {
      console.log("[Phase 2] Opening Easy Apply in new tab:", applyButton.href);
      
      const newTab = window.open(applyButton.href, '_blank');
      
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: "TRIGGER_PHASE1_IN_NEW_TAB",
          url: applyButton.href,
          email: getCurrentUserEmail()
        });
      }, 2000);
      
      return { success: true, action: "apply_opened_new_tab", url: applyButton.href };
    } else {
      console.log("[Phase 2] Clicking Apply Now button directly");
      applyButton.click();
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (window.location.href.includes('smartapply.indeed.com') || 
          window.location.href.includes('us.smartapply.indeed.com')) {
        console.log("[Phase 2] Navigated to Easy Apply form, triggering Phase 1");
        
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: "TRIGGER_PHASE1_IN_NEW_TAB",
            url: window.location.href,
            email: getCurrentUserEmail()
          });
        }, 1000);
        
        return { success: true, action: "apply_opened_current_tab" };
      }
      
      return { success: true, action: "apply_clicked_spa" };
    }
  }, false);
}

function getCurrentUserEmail() {
  const state = loadAutomationState();
  if (state && state.email) {
    return state.email;
  }
  
  const storedEmail = localStorage.getItem('jobblixor_email');
  if (storedEmail) {
    return storedEmail;
  }
  
  return "test@example.com";
}

async function runPhase2Automation(userProfile) {
  console.log("[Phase 2] ===== STARTING BULLETPROOF PHASE 2 AUTOMATION =====");
  console.log("[Phase 2] User profile:", userProfile);
  
  preventPageReloads();
  
  let processedCount = 0;
  let errorCount = 0;
  const maxErrors = 3;
  
  try {
    const targetJobs = parseInt(userProfile.targetJobs) || 10;
    sendStatusUpdate(`Target: ${targetJobs} applications - Starting job search...`);
    
    console.log("[Phase 2] ALWAYS performing fresh search...");
    await performRobustJobSearch(userProfile);
    
  } catch (error) {
    const errorMessage = `Phase 2 error: ${error.message}`;
    sendStatusUpdate(errorMessage);
    console.error(`[Phase 2] Fatal error:`, error);
    clearAutomationState();
    return { success: false, error: error.message };
  } finally {
    setTimeout(() => {
      allowPageReloads();
    }, 2000);
  }
}

async function resumePhase2Automation(savedState) {
  console.log("[Phase 2] ===== RESUMING PHASE 2 AUTOMATION =====");
  console.log("[Phase 2] Resuming with saved state:", savedState);
  
  preventPageReloads();
  
  let processedCount = savedState.processedCount || 0;
  let currentJobIndex = savedState.currentJobIndex || 0;
  let errorCount = savedState.errorCount || 0;
  let successfulApplications = 0;
  const maxErrors = 5;
  const userProfile = savedState.userProfile;
  const targetJobs = parseInt(userProfile.targetJobs) || 10;
  
  try {
    sendStatusUpdate(`Resuming automation - Target: ${targetJobs} applications`);
    
    console.log("[Phase 2] RESUMING: Waiting for search results...");
    const resultsLoaded = await waitForSearchResults();
    if (!resultsLoaded) {
      throw new Error("Search results did not load in time");
    }
    
    console.log("[Phase 2] Adding stabilization delay after search results loaded...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    sendStatusUpdate("Search results stabilized, analyzing jobs...");
    
    const allJobs = findAllJobCards();
    
    if (allJobs.length === 0) {
      sendStatusUpdate("No job cards found. Try different search terms.");
      clearAutomationState();
      return { success: false, reason: "no_job_cards_found" };
    }
    
    sendStatusUpdate(`Found ${allJobs.length} job cards - checking each for Easy Apply...`);
    
    const jobsToProcess = Math.min(allJobs.length, targetJobs * 3);
    
    for (let i = currentJobIndex; i < jobsToProcess && successfulApplications < targetJobs; i++) {
      const currentJob = allJobs[i];
      
      try {
        console.log(`[Phase 2] ===== PROCESSING JOB ${i + 1}/${jobsToProcess}: ${currentJob.title} =====`);
        sendStatusUpdate(`Checking job ${i + 1}/${jobsToProcess}: ${currentJob.title}...`);
        
        const currentState = loadAutomationState();
        if (currentState) {
          currentState.currentJobIndex = i;
          currentState.currentJob = currentJob;
          saveAutomationState(currentState);
        }
        
        console.log("[Phase 2] Waiting before clicking job card for stability...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await clickJobCardRobustly(currentJob, i);
        
        console.log("[Phase 2] Waiting for job details panel to fully load...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const panelReady = await waitForJobDetailsPanel();
        if (!panelReady) {
          console.warn(`[Phase 2] Job details panel not ready for ${currentJob.title}, skipping...`);
          sendStatusUpdate(`Could not load details for ${currentJob.title}, skipping...`);
          continue;
        }
        
        console.log("[Phase 2] Verifying job details panel is interactive...");
        await waitForPanelInteractive();
        
        const buttonCheck = await checkIfEasyApplyByButton();
        
        if (!buttonCheck.isEasyApply) {
          console.log(`[Phase 2] SKIP: ${currentJob.title} is NOT Easy Apply (${buttonCheck.reason})`);
          sendStatusUpdate(`Skipping ${currentJob.title} - not Easy Apply (${buttonCheck.buttonText || 'no button'})`);
          continue;
        }
        
        console.log(`[Phase 2] APPLY: ${currentJob.title} IS Easy Apply! Proceeding...`);
        sendStatusUpdate(`Found Easy Apply job: ${currentJob.title} - applying now!`);
        
        const applyResult = await clickApplyNowButton(buttonCheck);
        
        if (applyResult.success) {
          successfulApplications++;
          processedCount = i + 1;
          
          const currentState = loadAutomationState();
          if (currentState) {
            currentState.processedCount = processedCount;
            currentState.successfulApplications = successfulApplications;
            currentState.step = "application_opened";
            saveAutomationState(currentState);
          }
          
          sendStatusUpdate(`Application ${successfulApplications} opened: ${currentJob.title}`);
          
          if (applyResult.action === "apply_opened_new_tab") {
            await new Promise(resolve => setTimeout(resolve, 8000));
          } else if (applyResult.action === "apply_opened_current_tab") {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          errorCount = 0;
          
          if (successfulApplications >= targetJobs) {
            sendStatusUpdate(`Target reached! Successfully opened ${successfulApplications} Easy Apply applications.`);
            break;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 4000));
        
      } catch (error) {
        errorCount++;
        console.error(`[Phase 2] Error processing job ${i + 1}:`, error);
        sendStatusUpdate(`Error with ${currentJob.title}: ${error.message}`);
        
        const currentState = loadAutomationState();
        if (currentState) {
          currentState.errorCount = errorCount;
          saveAutomationState(currentState);
        }
        
        if (errorCount >= maxErrors) {
          throw new Error(`Too many errors (${errorCount}), stopping automation`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
    }
    
    if (successfulApplications === 0) {
      const finalMessage = `No Easy Apply jobs found in ${jobsToProcess} jobs checked. Try different search terms.`;
      sendStatusUpdate(finalMessage);
      console.log(`[Phase 2] ${finalMessage}`);
    } else {
      const finalMessage = `Phase 2 completed! Successfully opened ${successfulApplications} Easy Apply applications out of ${jobsToProcess} jobs checked.`;
      sendStatusUpdate(finalMessage);
      console.log(`[Phase 2] ${finalMessage}`);
    }
    
    clearAutomationState();
    
    return { 
      success: true, 
      processed: jobsToProcess, 
      successfulApplications: successfulApplications,
      total: jobsToProcess 
    };
    
  } catch (error) {
    const errorMessage = `Phase 2 error: ${error.message}`;
    sendStatusUpdate(errorMessage);
    console.error(`[Phase 2] Fatal error:`, error);
    clearAutomationState();
    return { success: false, error: error.message };
  } finally {
    setTimeout(() => {
      allowPageReloads();
    }, 2000);
  }
}

async function waitForPanelInteractive(maxWait = 5000) {
  console.log("[Phase 2] Waiting for job details panel to be interactive...");
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkInteractive = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      const detailsPanel = document.querySelector(
        '.jobsearch-ViewjobPaneWrapper, .jobsearch-JobComponent, [data-testid*="jobDetails"]'
      );
      
      if (detailsPanel) {
        const loadingOverlay = detailsPanel.querySelector('[data-testid*="loading"], .loading, .spinner');
        const hasLoadingOpacity = detailsPanel.style.opacity === '0' || detailsPanel.style.opacity < 1;
        const applyButtonArea = detailsPanel.querySelector('button, a');
        const isInteractive = !loadingOverlay && !hasLoadingOpacity && applyButtonArea;
        
        if (isInteractive || elapsed >= maxWait) {
          clearInterval(checkInteractive);
          console.log(`[Phase 2] Job details panel interactive (${elapsed}ms)`);
          resolve(isInteractive);
        }
      } else if (elapsed >= maxWait) {
        clearInterval(checkInteractive);
        console.log(`[Phase 2] Job details panel timeout (${elapsed}ms)`);
        resolve(false);
      }
    }, 500);
  });
}

function checkAndResumeAutomation() {
  console.log('[State] Checking for automation state to resume...');
  
  const savedState = shouldResumeAutomation();
  if (!savedState) {
    console.log('[State] No automation state to resume');
    return;
  }
  
  console.log('[State] Found automation state, preparing to resume...');
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => resumePhase2Automation(savedState), 2000);
    });
  } else {
    setTimeout(() => resumePhase2Automation(savedState), 2000);
  }
}

// ==========================================
// PHASE 1 AUTOMATION FUNCTIONS
// ==========================================

console.log("[Jobblixor DEBUG] content.js loaded on page:", window.location.href);

let autoStartEmail = null;
let isRunning = false;
let isPaused = false;
let pageCheckInterval = null;
let targetJobCount = 1;
let currentJobCount = 0;
let processedPages = new Set();

function startContinuousMonitoring(email) {
  autoStartEmail = email;
  console.log("[Jobblixor DEBUG] Starting continuous monitoring with email:", email);
  
  if (pageCheckInterval) {
    clearInterval(pageCheckInterval);
  }
  
  pageCheckInterval = setInterval(() => {
    checkForAutoStart();
  }, 3000);
}

function stopContinuousMonitoring() {
  console.log("[Jobblixor DEBUG] Stopping continuous monitoring");
  autoStartEmail = null;
  isRunning = false;
  isPaused = false;
  processedPages.clear();
  if (pageCheckInterval) {
    clearInterval(pageCheckInterval);
    pageCheckInterval = null;
  }
}

function checkForAutoStart() {
  const currentUrl = window.location.href;
  
  if (isRunning || isPaused || !autoStartEmail) {
    return;
  }

  if (processedPages.has(currentUrl)) {
    console.log("[Jobblixor DEBUG] Page already processed, skipping:", currentUrl);
    return;
  }

  if (currentJobCount >= targetJobCount) {
    logProgress(autoStartEmail, `Target of ${targetJobCount} applications reached!`);
    stopContinuousMonitoring();
    return;
  }
  
  if (isIndeedApplicationPage(currentUrl)) {
    console.log("[Jobblixor DEBUG] Auto-starting bot on NEW page:", currentUrl);
    
    processedPages.add(currentUrl);
    isRunning = true;
    
    setTimeout(() => {
      startJobblixorBot(autoStartEmail).then(() => {
        isRunning = false;
      }).catch((err) => {
        console.error("[Jobblixor DEBUG] Auto-start error:", err);
        isRunning = false;
        processedPages.delete(currentUrl);
      });
    }, 1500);
  }
}

function isIndeedApplicationPage(url) {
  const applicationPatterns = [
    '/form/questions-module/',
    '/form/demographic-questions/',
    '/form/resume-selection-module/',
    '/form/contact-module/',
    '/form/contact-info-module/',
    '/apply',
    '/job-application',
    '/application/',
    '/questions/',
    '/demographic/',
    '/resume-selection',
    '/contact-information'
  ];
  
  const isApplicationPage = applicationPatterns.some(pattern => url.includes(pattern));
  
  const hasApplicationElements = 
    document.querySelector('button[type="submit"]') ||
    document.querySelector('input[type="submit"]') ||
    document.querySelector('button') ||
    document.querySelector('[data-testid*="continue"]') ||
    document.querySelector('[data-testid*="submit"]') ||
    Array.from(document.querySelectorAll('button')).find(btn => 
      /continue|submit|next|review|apply/i.test(btn.textContent || btn.innerText || '')
    );
  
  const finalResult = isApplicationPage || (url.includes('indeed.com') && hasApplicationElements);
  
  if (finalResult) {
    console.log("[Jobblixor DEBUG] Detected application page:", url);
  }
  
  return finalResult;
}

async function startJobblixorBot(email) {
  try {
    if (isPaused) {
      logProgress(email, "Bot is paused. Click Resume to continue.");
      return;
    }
    
    console.log("[Jobblixor DEBUG] startJobblixorBot called with:", email);
    const profile = await fetchUserProfile(email);
    console.log("[Jobblixor DEBUG] Fetched user profile:", profile);

    logProgress(email, "Starting Jobblixor auto-apply bot...");

    const screeningAnswered = handleScreeningQuestions(profile);
    if (screeningAnswered > 0) {
      logProgress(email, `Answered ${screeningAnswered} screening questions`);
    }

    const currentUrl = window.location.href;
    if (currentUrl.includes('resume-selection')) {
      console.log("[Jobblixor DEBUG] On resume selection page - resume appears ready");
      logProgress(email, "Resume page detected - proceeding to Continue");
    } else {
      const resumePageHandled = handleResumeSelectionPage();
      if (resumePageHandled) {
        logProgress(email, "Handled resume selection page");
      }
    }

    const remainingCheckboxes = await forceCheckAvailabilityBoxes();
    if (remainingCheckboxes > 0) {
      logProgress(email, `Force-checked ${remainingCheckboxes} availability checkboxes`);
    }

    const fieldMappings = getFieldMappings(profile);
    let filledAny = false;
    fieldMappings.forEach(map => {
      if (map.value && robustFillFieldFixed(map.keywords, map.value)) {
        logProgress(email, `Filled one of ${map.keywords.join('/')} with "${map.value}"`);
        filledAny = true;
      }
    });

    fillAllCheckboxes();

    let resumeUploaded = false;
    let resumeHandledContinue = false;
    if (profile.resume) {
      const result = await uploadResumeFromFirebase(profile.resume);
      resumeUploaded = result.uploaded;
      resumeHandledContinue = result.clickedContinue;
    }

    if (!filledAny && !resumeUploaded && screeningAnswered === 0) {
      if (!detectAnyFillableInputs()) {
        logProgress(email, "No fillable fields detected. Manual input may be required.");
      } else {
        logProgress(email, "No known fields matched on this form step.");
      }
    }

    if (!resumeHandledContinue) {
      console.log("[Jobblixor DEBUG] Waiting for form validation and data persistence...");
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const nextBtn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
        .find(b => /next|continue|submit|review.*application|apply|proceed/i.test(b.innerText || b.value));
      if (nextBtn) {
        if (!nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true') {
          console.log("[Jobblixor DEBUG] Verifying form data before clicking Continue...");
          
          const phoneInputs = document.querySelectorAll('input[type="tel"], input[name*="phone"], input[id*="phone"]');
          for (const phoneInput of phoneInputs) {
            if (phoneInput.value) {
              console.log(`[Jobblixor DEBUG] Phone field verified: "${phoneInput.value}"`);
            } else {
              console.log(`[Jobblixor DEBUG] Phone field is empty, may need re-filling`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          nextBtn.click();
          logProgress(email, "Clicked Continue button");
        } else {
          console.log("[Jobblixor DEBUG] Continue button is disabled - may need to answer more questions");
        }
      } else {
        console.log("[Jobblixor DEBUG] No Continue button found.");
      }
    }

    logProgress(email, "Step complete! Bot waiting for next page...");
    
    if (window.location.href.includes('application-submitted') || 
        window.location.href.includes('thank-you') || 
        window.location.href.includes('confirmation') ||
        window.location.href.includes('success') ||
        document.querySelector('.application-complete') ||
        document.querySelector('[data-testid="application-complete"]') ||
        document.querySelector('[data-testid*="success"]') ||
        document.querySelector('[data-testid*="submitted"]') ||
        Array.from(document.querySelectorAll('h1, h2')).find(h => 
          /application.*submitted|thank.*you|success|complete/i.test(h.textContent || '')
        )) {
      
      currentJobCount++;
      logProgress(email, `APPLICATION ${currentJobCount} SUBMITTED SUCCESSFULLY!`);
      
      chrome.runtime.sendMessage({
        type: "APPLICATION_COMPLETED",
        email: email
      });
      
      if (currentJobCount >= targetJobCount) {
        logProgress(email, `Target of ${targetJobCount} applications reached!`);
        chrome.runtime.sendMessage({
          type: "APPLICATION_FLOW_COMPLETE",
          email: email
        });
        stopContinuousMonitoring();
      } else {
        logProgress(email, `Progress: ${currentJobCount}/${targetJobCount} applications completed`);
      }
      
      console.log("[Jobblixor DEBUG] Application completed!");
    } else {
      logProgress(email, "Waiting for page navigation to continue automatically...");
      console.log("[Jobblixor DEBUG] Current URL:", window.location.href);
      console.log("[Jobblixor DEBUG] Continuous monitoring will handle next page automatically");
    }
  } catch (err) {
    logProgress(email, `Error: ${err}`);
    console.error("[Jobblixor DEBUG] ERROR in main automation:", err);
  }
}

function fetchUserProfile(email) {
  console.log("[Jobblixor DEBUG] fetchUserProfile called with:", email);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "FETCH_USER_DOC", email }, (response) => {
      console.log("[Jobblixor DEBUG] FETCH_USER_DOC response:", response);
      if (response?.success && response.data) {
        const profile = {
          first_name: "Livia",
          last_name: "DeMori",
          email: email,
          phone_number: "3524434968",
          location: "New York, NY",
          zip_code: "10001",
          street_address: "123 Main Street",
          years_experience: "2-3",
          gender: "female",
          ethnicity: "asian",
          veteran_status: "no",
          hispanic_latino: "no",
          over_18: "yes",
          authorized_us: "yes",
          require_sponsorship: "no",
          preferred_salary: "50000",
          resume: null,
          ...response.data
        };
        resolve(profile);
      } else {
        resolve({
          first_name: "Livia",
          last_name: "DeMori", 
          email: email,
          phone_number: "3524434968",
          location: "New York, NY",
          zip_code: "10001",
          street_address: "123 Main Street",
          years_experience: "2-3",
          gender: "female",
          ethnicity: "asian",
          veteran_status: "no",
          hispanic_latino: "no",
          over_18: "yes",
          authorized_us: "yes",
          require_sponsorship: "no",
          preferred_salary: "50000",
          resume: null
        });
      }
    });
  });
}

function handleScreeningQuestions(profile) {
  console.log("[Jobblixor DEBUG] Checking for screening questions...");
  let answeredCount = 0;

  const screeningRules = [
    {
      patterns: ['18 years of age', '18 years or older', 'at least 18', 'eighteen years'],
      answer: 'yes',
      profileKey: 'over_18'
    },
    {
      patterns: ['authorized to work', 'right to work', 'eligible to work', 'work authorization'],
      answer: 'yes',
      profileKey: 'authorized_us'
    },
    {
      patterns: ['require sponsorship', 'need sponsorship', 'visa sponsorship', 'work visa'],
      answer: 'no',
      profileKey: 'require_sponsorship'
    },
    {
      patterns: ['years of experience', 'relevant experience', 'work experience'],
      answer: profile.years_experience || '0-2',
      profileKey: 'years_experience'
    },
    {
      patterns: ['willing to relocate', 'open to relocation', 'relocate for'],
      answer: 'yes',
      profileKey: 'willing_relocate'
    },
    {
      patterns: ['available to start', 'start date', 'when can you start'],
      answer: 'immediately',
      profileKey: 'start_date'
    },
    {
      patterns: ['availability to work', 'general availability', 'available to work'],
      answer: 'all',
      profileKey: 'availability'
    },
    {
      patterns: ['full time or part time', 'full time and part time', 'work schedule', 'employment type'],
      answer: 'both full time and part time',
      profileKey: 'schedule_preference'
    },
    {
      patterns: ['nights', 'night shifts', 'overnight'],
      answer: 'yes',
      profileKey: 'nights_available'
    },
    {
      patterns: ['days', 'day shifts', 'daytime'],
      answer: 'yes',
      profileKey: 'days_available'
    },
    {
      patterns: ['holidays', 'holiday work'],
      answer: 'yes',
      profileKey: 'holidays_available'
    },
    {
      patterns: ['weekends', 'weekend work'],
      answer: 'yes',
      profileKey: 'weekends_available'
    },
    {
      patterns: ['please enter your gender', 'enter your gender', 'gender'],
      answer: profile.gender || 'not declared',
      profileKey: 'gender'
    },
    {
      patterns: ['please enter your ethnicity', 'enter your ethnicity', 'ethnicity'],
      answer: profile.ethnicity || 'prefer not to answer',
      profileKey: 'ethnicity'
    },
    {
      patterns: ['please enter your veteran status', 'enter your veteran status', 'veteran status'],
      answer: profile.veteran_status || 'i am not a veteran',
      profileKey: 'veteran_status'
    },
    {
      patterns: ['do you identify as hispanic', 'hispanic/latino', 'hispanic', 'latino'],
      answer: profile.hispanic_latino || 'no',
      profileKey: 'hispanic_latino'
    },
    {
      patterns: ['share these answers', 'terms and conditions', 'consent', 'agree'],
      answer: 'yes',
      profileKey: 'consent_sharing'
    }
  ];

  const questionElements = Array.from(document.querySelectorAll('p, div, label, legend, h3, h4'))
    .filter(el => {
      const text = el.textContent.toLowerCase();
      return text.includes('?') && text.length > 10 && text.length < 200;
    });

  console.log(`[Jobblixor DEBUG] Found ${questionElements.length} potential questions`);

  handleStandaloneCheckboxGroups();

  questionElements.forEach(questionEl => {
    const questionText = questionEl.textContent.toLowerCase();
    console.log(`[Jobblixor DEBUG] Analyzing question: "${questionText}"`);

    const matchedRule = screeningRules.find(rule => 
      rule.patterns.some(pattern => questionText.includes(pattern))
    );

    if (matchedRule) {
      console.log(`[Jobblixor DEBUG] Matched rule for: ${matchedRule.patterns[0]}`);
      
      let answerValue = profile[matchedRule.profileKey] || matchedRule.answer;
      
      const questionContainer = questionEl.closest('div, fieldset, form') || questionEl.parentElement;
      if (questionContainer) {
        if (matchedRule.answer === 'all') {
          const checkboxes = questionContainer.querySelectorAll('input[type="checkbox"]');
          if (checkboxes.length > 0) {
            console.log(`[Jobblixor DEBUG] Found ${checkboxes.length} availability checkboxes - checking all`);
            checkboxes.forEach(checkbox => {
              if (!checkbox.checked) {
                checkbox.checked = true;
                checkbox.click();
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`[Jobblixor DEBUG] Checked availability option: ${checkbox.value || checkbox.id}`);
              }
            });
            answeredCount++;
            return;
          }
        }

        const radios = questionContainer.querySelectorAll('input[type="radio"]');
        const answered = handleRadioQuestion(radios, answerValue, questionText);
        if (answered) {
          answeredCount++;
          return;
        }

        const selects = questionContainer.querySelectorAll('select');
        const selectedDropdown = handleSelectQuestion(selects, answerValue, questionText);
        if (selectedDropdown) {
          answeredCount++;
          return;
        }

        const checkboxes = questionContainer.querySelectorAll('input[type="checkbox"]');
        const checkedBox = handleCheckboxQuestion(checkboxes, answerValue, questionText);
        if (checkedBox) {
          answeredCount++;
        }
      }
    } else {
      console.log(`[Jobblixor DEBUG] No rule matched for: "${questionText}" - applying fallback logic`);
      const handled = handleUnknownQuestion(questionEl, questionText);
      if (handled) {
        answeredCount++;
      }
    }
  });

  handleDemographicFormElements(profile);

  console.log(`[Jobblixor DEBUG] Answered ${answeredCount} screening questions total`);
  return answeredCount;