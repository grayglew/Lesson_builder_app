const ALLOWED_SCRIPT_USER_EMAIL = 'gglew@dbis.edu.hk';
const DESTINATION_FOLDER_ID = '';
const DEFAULT_UPLOAD_FOLDER_NAME = 'Classroom Lesson Uploads';
const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_CLASSROOM_MATERIALS = 20;
const README_ENTRY_NAME = 'README.txt';

function doGet() {
  requireAllowedUser_();
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Classroom Lesson Uploader')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function requireAllowedUser_() {
  const email = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const allowed = String(ALLOWED_SCRIPT_USER_EMAIL || '').toLowerCase();
  if (allowed && email !== allowed) {
    throw new Error('This uploader is restricted to ' + ALLOWED_SCRIPT_USER_EMAIL + '. You are signed in as ' + (email || 'unknown') + '.');
  }
}

function listTeachingCourses() {
  requireAllowedUser_();
  const courses = [];
  let pageToken = null;

  do {
    const response = Classroom.Courses.list({
      teacherId: 'me',
      courseStates: ['ACTIVE'],
      pageSize: 100,
      pageToken: pageToken
    });
    const pageCourses = response && response.courses ? response.courses : [];
    pageCourses.forEach(function(course) {
      courses.push({
        id: course.id || '',
        name: course.name || '',
        section: course.section || '',
        alternateLink: course.alternateLink || ''
      });
    });
    pageToken = response && response.nextPageToken ? response.nextPageToken : null;
  } while (pageToken);

  courses.sort(function(a, b) {
    return courseLabel_(a).localeCompare(courseLabel_(b));
  });

  return courses;
}

function getComposerData(courseId) {
  requireAllowedUser_();
  const id = requireText_(courseId, 'Course ID');
  return {
    courseId: id,
    topics: listAllClassroomTopics_(id).map(function(topic) {
      return {
        topicId: topic.topicId || '',
        name: topic.name || ''
      };
    })
  };
}

function createBundleLessonMaterial(payload) {
  requireAllowedUser_();
  const data = payload || {};
  const courseId = requireText_(data.courseId, 'Course ID');
  const title = requireText_(data.title, 'Post title');
  const description = String(data.description || '').trim();
  const scheduledTime = normalizeScheduledTime_(data.scheduledTimeIso);
  const bundle = data.bundle || {};
  const bundleName = ensureZipFileName_(bundle.name || title || 'lesson-bundle.zip');
  const reportedSize = Number(bundle.size || 0);

  if (reportedSize > MAX_ZIP_BYTES) {
    throw new Error('The selected bundle is larger than the ' + formatBytes_(MAX_ZIP_BYTES) + ' upload limit.');
  }

  const zipBase64 = requireText_(bundle.base64, 'Lesson bundle');
  const zipBlob = base64ToBlob_(zipBase64, bundle.mimeType || 'application/zip', bundleName);

  if (zipBlob.getBytes().length > MAX_ZIP_BYTES) {
    throw new Error('The selected bundle is larger than the ' + formatBytes_(MAX_ZIP_BYTES) + ' upload limit.');
  }

  const attachmentBlobs = extractLessonBundleFiles_(zipBlob);
  if (attachmentBlobs.length > MAX_CLASSROOM_MATERIALS) {
    throw new Error('Google Classroom materials can have at most ' + MAX_CLASSROOM_MATERIALS + ' attached items. This bundle contains ' + attachmentBlobs.length + ' attachable files.');
  }

  let lessonFolder = null;
  let uploadedFiles = [];

  try {
    const topicId = ensureClassroomTopic_(courseId, data.topicId, data.newTopicName);
    lessonFolder = createLessonUploadFolder_(title);
    uploadedFiles = attachmentBlobs.map(function(item) {
      const blob = Utilities.newBlob(item.blob.getBytes(), item.mimeType, item.fileName);
      const file = lessonFolder.createFile(blob).setName(item.fileName);
      return {
        id: file.getId(),
        title: file.getName(),
        url: file.getUrl()
      };
    });

    const materials = uploadedFiles.map(function(file) {
      return buildDriveMaterial_(file.id, file.title, file.url);
    });

    if (materials.length > MAX_CLASSROOM_MATERIALS) {
      throw new Error('Google Classroom materials can have at most ' + MAX_CLASSROOM_MATERIALS + ' attached items.');
    }

    const requestBody = {
      title: title,
      state: scheduledTime ? 'DRAFT' : 'PUBLISHED',
      materials: materials
    };

    if (description) requestBody.description = description;
    if (topicId) requestBody.topicId = topicId;
    if (scheduledTime) {
      requestBody.scheduledTime = scheduledTime;
    }

    const created = Classroom.Courses.CourseWorkMaterials.create(requestBody, courseId);

    return {
      courseId: courseId,
      title: title,
      topicId: topicId || '',
      postId: created && created.id ? created.id : '',
      alternateLink: created && created.alternateLink ? created.alternateLink : '',
      isScheduled: !!scheduledTime,
      scheduledTime: scheduledTime,
      attachmentCount: uploadedFiles.length,
      fileNames: uploadedFiles.map(function(file) { return file.title; }),
      folderId: lessonFolder ? lessonFolder.getId() : '',
      folderUrl: lessonFolder ? lessonFolder.getUrl() : ''
    };
  } catch (err) {
    cleanupUploadedFiles_(uploadedFiles, lessonFolder);
    throw err;
  }
}

function extractLessonBundleFiles_(zipBlob) {
  let entries = [];
  try {
    entries = Utilities.unzip(zipBlob);
  } catch (err) {
    throw new Error('Please upload a valid Lesson Builder lesson bundle zip.');
  }

  const rootPptx = [];
  const rootPdf = [];
  const worksheetPdfs = [];
  const readmeEntries = [];

  entries.forEach(function(blob) {
    const entryName = normalizeZipEntryName_(blob.getName());
    if (!entryName) return;
    if (entryName.toLowerCase() === README_ENTRY_NAME.toLowerCase()) {
      readmeEntries.push({ name: entryName, blob: blob });
      return;
    }

    if (/^[^/]+\.pptx$/i.test(entryName)) {
      rootPptx.push({ name: entryName, blob: blob });
      return;
    }

    if (/^[^/]+\.pdf$/i.test(entryName)) {
      rootPdf.push({ name: entryName, blob: blob });
      return;
    }

    if (/^worksheets\/[^/]+\.pdf$/i.test(entryName)) {
      worksheetPdfs.push({ name: entryName, blob: blob });
    }
  });

  if (rootPptx.length > 1) {
    throw new Error('The legacy lesson bundle may contain at most one root PowerPoint file (.pptx). Found ' + rootPptx.length + '.');
  }

  worksheetPdfs.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  const isFormat2 = readmeEntries.some(function(entry) {
    return entry.blob.getDataAsString().indexOf('Lesson Builder bundle format: 2') >= 0;
  });

  if (!isFormat2 && rootPdf.length === 1) {
    return [rootPdf[0]].concat(worksheetPdfs).map(toDriveAttachment_);
  }

  if (rootPdf.length !== 2) {
    throw new Error('A current lesson bundle must contain one saved-state PDF and one matching -answers PDF. Found ' + rootPdf.length + ' root PDFs.');
  }

  const pairs = rootPdf.map(function(candidate) {
    const base = candidate.name.replace(/\.pdf$/i, '');
    const expectedAnswer = (base + '-answers.pdf').toLowerCase();
    const answer = rootPdf.find(function(item) {
      return item !== candidate && item.name.toLowerCase() === expectedAnswer;
    });
    return answer ? { lesson: candidate, answers: answer } : null;
  }).filter(Boolean);

  if (pairs.length !== 1) {
    throw new Error('The two root PDFs must be named <lesson>.pdf and <lesson>-answers.pdf.');
  }

  return [pairs[0].lesson, pairs[0].answers]
    .concat(worksheetPdfs)
    .map(toDriveAttachment_);
}

function toDriveAttachment_(entry) {
  const fileName = safeDriveFileName_(baseName_(entry.name));
  return {
    fileName: fileName,
    mimeType: mimeTypeForFileName_(fileName),
    blob: entry.blob
  };
}

function getUploadRootFolder_() {
  if (DESTINATION_FOLDER_ID && DESTINATION_FOLDER_ID.indexOf('PUT_') !== 0) {
    return DriveApp.getFolderById(DESTINATION_FOLDER_ID);
  }

  const folders = DriveApp.getFoldersByName(DEFAULT_UPLOAD_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DEFAULT_UPLOAD_FOLDER_NAME);
}

function createLessonUploadFolder_(title) {
  const root = getUploadRootFolder_();
  const timeZone = Session.getScriptTimeZone() || 'Etc/UTC';
  const stamp = Utilities.formatDate(new Date(), timeZone, 'yyyyMMdd-HHmmss');
  const folderName = safeDriveFileName_(title).substring(0, 120) + ' - ' + stamp;
  return root.createFolder(folderName);
}

function cleanupUploadedFiles_(uploadedFiles, lessonFolder) {
  (Array.isArray(uploadedFiles) ? uploadedFiles : []).forEach(function(file) {
    try {
      if (file && file.id) DriveApp.getFileById(file.id).setTrashed(true);
    } catch (trashErr) {}
  });

  if (lessonFolder) {
    try {
      lessonFolder.setTrashed(true);
    } catch (folderErr) {}
  }
}

function listAllClassroomTopics_(courseId) {
  const allTopics = [];
  let pageToken = null;

  do {
    const response = Classroom.Courses.Topics.list(courseId, {
      pageSize: 100,
      pageToken: pageToken
    });
    const topics = response && response.topic ? response.topic : [];
    topics.forEach(function(topic) {
      allTopics.push(topic);
    });
    pageToken = response && response.nextPageToken ? response.nextPageToken : null;
  } while (pageToken);

  allTopics.sort(function(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return allTopics;
}

function ensureClassroomTopic_(courseId, selectedTopicId, newTopicName) {
  const newName = String(newTopicName || '').replace(/\s+/g, ' ').trim();
  if (!newName) return String(selectedTopicId || '').trim();

  const existingTopics = listAllClassroomTopics_(courseId);
  const target = normalizeTopicName_(newName);
  for (let i = 0; i < existingTopics.length; i++) {
    const topic = existingTopics[i];
    if (normalizeTopicName_(topic.name) === target && topic.topicId) {
      return topic.topicId;
    }
  }

  const created = Classroom.Courses.Topics.create({ name: newName }, courseId);
  return created && created.topicId ? created.topicId : '';
}

function buildDriveMaterial_(fileId, fileTitle, fileUrl) {
  const driveFile = { id: fileId };
  if (fileTitle) driveFile.title = fileTitle;
  if (fileUrl) driveFile.alternateLink = fileUrl;

  return {
    driveFile: {
      driveFile: driveFile,
      shareMode: 'VIEW'
    }
  };
}

function normalizeScheduledTime_(scheduledTimeIso) {
  const text = String(scheduledTimeIso || '').trim();
  if (!text) return '';

  const date = new Date(text);
  if (isNaN(date.getTime())) {
    throw new Error('The scheduled post time is not valid.');
  }

  if (date.getTime() <= Date.now()) {
    throw new Error('The scheduled post time must be in the future.');
  }

  return date.toISOString();
}

function base64ToBlob_(base64, mimeType, fileName) {
  const bytes = Utilities.base64Decode(base64);
  return Utilities.newBlob(bytes, mimeType || 'application/octet-stream', fileName || 'lesson-bundle.zip');
}

function normalizeZipEntryName_(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

function baseName_(value) {
  const parts = normalizeZipEntryName_(value).split('/');
  return parts[parts.length - 1] || 'lesson-file';
}

function ensureZipFileName_(value) {
  const clean = safeDriveFileName_(String(value || 'lesson-bundle.zip').trim() || 'lesson-bundle.zip');
  return /\.zip$/i.test(clean) ? clean : clean + '.zip';
}

function safeDriveFileName_(value) {
  return String(value || 'lesson-file')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 180) || 'lesson-file';
}

function mimeTypeForFileName_(fileName) {
  if (/\.pdf$/i.test(fileName)) return 'application/pdf';
  if (/\.pptx$/i.test(fileName)) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return 'application/octet-stream';
}

function requireText_(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error((label || 'Value') + ' is required.');
  return text;
}

function normalizeTopicName_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function courseLabel_(course) {
  return String(course.name || '') + (course.section ? ' - ' + course.section : '');
}

function formatBytes_(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024) return num + ' B';
  if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
  return (num / (1024 * 1024)).toFixed(1) + ' MB';
}
