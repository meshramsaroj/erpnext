// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.ui.form.on('Packing Slip', {
	setup: function(frm) {
		erpnext.queries.setup_queries(frm, "Warehouse", function() {
			return erpnext.queries.warehouse(frm.doc);
		});
	},	
	delivery_note: function (frm) {
		if (frm.doc.delivery_note) {
			frappe.db.get_value('Delivery Note', { name: frm.doc.delivery_note }, 'company', (r) => {
				frm.set_value("company", r.company);
			});
			erpnext.queries.setup_queries(frm, "Warehouse", function () {
				return erpnext.queries.warehouse(frm.doc);
			});
		}
	},
	source_warehouse: function (frm) {
		if (frm.doc.source_warehouse) {
			$.each(frm.doc.items || [], function (i, item) {
				frappe.model.set_value(frm.doctype + " Item", item.name, "source_warehouse", frm.doc.source_warehouse);
			});
		}
	},
	target_warehouse: function (frm) {
		if (frm.doc.target_warehouse) {
			$.each(frm.doc.items || [], function (i, item) {
				frappe.model.set_value(frm.doctype + " Item", item.name, "target_warehouse", frm.doc.target_warehouse);
			});
		}
	}
});

frappe.ui.form.on('Packing Slip Item', {
	box_type: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.box_type && row.qty) {
			frappe.call({
				method: "erpnext.stock.doctype.packing_slip.packing_slip.fetch_no_of_boxes_required",
				args: {
					"item_code": row.item_code,
					"box_type": row.box_type,
					"qty": row.qty,
					"uom": row.stock_uom
				},
				callback: function(r) {
					if (r && r.message) {
						frappe.model.set_value(cdt, cdn, "no_of_boxes_required", r.message);
					}
				}
			});
		}
	}
});

cur_frm.fields_dict['delivery_note'].get_query = function(doc, cdt, cdn) {
	return{
		filters:{ 'docstatus': 0}
	}
}

cur_frm.set_query('box_type', 'items', function(doc,cdt,cdn) {
	let row = locals[cdt][cdn];
	return {
		query: "erpnext.stock.doctype.packing_slip.packing_slip.get_box_type_for_item",
		filters:{ 'item_code': row.item_code}
	}
})


cur_frm.fields_dict['items'].grid.get_field('item_code').get_query = function(doc, cdt, cdn) {
	if(!doc.delivery_note) {
		frappe.throw(__("Please select a Delivery Note"));
	} else {
		return {
			query: "erpnext.stock.doctype.packing_slip.packing_slip.item_details",
			filters:{ 'delivery_note': doc.delivery_note}
		}
	}
}

cur_frm.cscript.onload_post_render = function(doc, cdt, cdn) {
	if(doc.delivery_note && doc.__islocal) {
		cur_frm.cscript.get_items(doc, cdt, cdn);
	}
}

cur_frm.cscript.get_items = function(doc, cdt, cdn) {
	return this.frm.call({
		doc: this.frm.doc,
		method: "get_items",
		callback: function(r) {
			if(!r.exc) cur_frm.refresh();
		}
	});
}

cur_frm.cscript.refresh = function(doc, dt, dn) {
	cur_frm.toggle_display("misc_details", doc.amended_from);
}

cur_frm.cscript.validate = function(doc, cdt, cdn) {
	cur_frm.cscript.validate_case_nos(doc);
	cur_frm.cscript.validate_calculate_item_details(doc);
}

// To Case No. cannot be less than From Case No.
cur_frm.cscript.validate_case_nos = function(doc) {
	doc = locals[doc.doctype][doc.name];
	if(cint(doc.from_case_no)==0) {
		frappe.msgprint(__("The 'From Package No.' field must neither be empty nor it's value less than 1."));
		frappe.validated = false;
	} else if(!cint(doc.to_case_no)) {
		doc.to_case_no = doc.from_case_no;
		refresh_field('to_case_no');
	} else if(cint(doc.to_case_no) < cint(doc.from_case_no)) {
		frappe.msgprint(__("<b>To Package No.: {0}</b> cannot be less than <b>From Package No.: {1}</b>",[doc.to_case_no , doc.from_case_no]));
		frappe.validated = false;
	}
}


cur_frm.cscript.validate_calculate_item_details = function(doc) {
	doc = locals[doc.doctype][doc.name];
	var ps_detail = doc.items || [];

	cur_frm.cscript.validate_duplicate_items(doc, ps_detail);
	cur_frm.cscript.calc_net_total_pkg(doc, ps_detail);
}


// Do not allow duplicate items i.e. items with same item_code
// Also check for 0 qty
cur_frm.cscript.validate_duplicate_items = function(doc, ps_detail) {
	for(var i=0; i<ps_detail.length; i++) {
		for(var j=0; j<ps_detail.length; j++) {
			if(i!=j && ps_detail[i].item_code && ps_detail[i].item_code==ps_detail[j].item_code) {
				frappe.msgprint(__("You have entered duplicate items. Please rectify and try again."));
				frappe.validated = false;
				return;
			}
		}
		if(flt(ps_detail[i].qty)<=0) {
			frappe.msgprint(__("Invalid quantity specified for item {0}. Quantity should be greater than 0.", [ps_detail[i].item_code]));
			frappe.validated = false;
		}
	}
}


// Calculate Net Weight of Package
cur_frm.cscript.calc_net_total_pkg = function(doc, ps_detail) {
	var net_weight_pkg = 0;
	doc.net_weight_uom = (ps_detail && ps_detail.length) ? ps_detail[0].weight_uom : '';
	doc.gross_weight_uom = doc.net_weight_uom;

	for(var i=0; i<ps_detail.length; i++) {
		var item = ps_detail[i];
		if(item.weight_uom != doc.net_weight_uom) {
			frappe.msgprint(__("Different UOM for items will lead to incorrect (Total) Net Weight value. Make sure that Net Weight of each item is in the same UOM."));
			frappe.validated = false;
		}
		net_weight_pkg += flt(item.net_weight) * flt(item.qty);
	}

	doc.net_weight_pkg = roundNumber(net_weight_pkg, 2);
	if(!flt(doc.gross_weight_pkg)) {
		doc.gross_weight_pkg = doc.net_weight_pkg;
	}
	refresh_many(['net_weight_pkg', 'net_weight_uom', 'gross_weight_uom', 'gross_weight_pkg']);
}

var make_row = function(title,val,bold){
	var bstart = '<b>'; var bend = '</b>';
	return '<tr><td class="datalabelcell">'+(bold?bstart:'')+title+(bold?bend:'')+'</td>'
	+'<td class="datainputcell" style="text-align:left;">'+ val +'</td>'
	+'</tr>'
}

cur_frm.pformat.net_weight_pkg= function(doc){
	return '<table style="width:100%">' + make_row('Net Weight', doc.net_weight_pkg) + '</table>'
}

cur_frm.pformat.gross_weight_pkg= function(doc){
	return '<table style="width:100%">' + make_row('Gross Weight', doc.gross_weight_pkg) + '</table>'
}

// TODO: validate gross weight field
