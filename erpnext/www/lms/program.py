from __future__ import unicode_literals
import erpnext.education.utils as utils
import frappe
from frappe import _

no_cache = 1

def get_context(context):
	try:
		program = frappe.form_dict['program']
	except KeyError:
		frappe.local.flags.redirect_location = '/lms'
		raise frappe.Redirect

	context.education_settings = frappe.get_single("Education Settings")
	context.program = get_program(program)
	context.courses = [frappe.get_doc("Course", course.course) for course in context.program.courses]
	context.has_access = utils.allowed_program_access(program)
	context.progress = get_course_progress(context.courses, program)
	context.total_progress = calculate_progress(context.progress)

def get_program(program_name):
	try:
		return frappe.get_doc('Program', program_name)
	except frappe.DoesNotExistError:
		frappe.throw(_("Program {0} does not exist.".format(program_name)))

def get_course_progress(courses, program):
	progress = {course.name: utils.get_course_progress(course, program) for course in courses}
	return progress

def calculate_progress(progress):
	total_topic = len(progress)
	complete_topic = 0
	for p in progress:
		for status in progress[p]:
			if status == "completed" and progress[p][status] == True:
				complete_topic = complete_topic + 1
	total_progress = int((complete_topic * 100) / total_topic)
	return total_progress